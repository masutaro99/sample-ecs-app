import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as logs from "aws-cdk-lib/aws-logs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as rds from "aws-cdk-lib/aws-rds";

export interface MainStackProps extends cdk.StackProps {
  repositoryName: string;
  imageTag: string;
}

export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
    });

    // Secret for DB credentials
    const dbSecret = new secretsmanager.Secret(this, "AuroraSecret", {
      secretName: `aurora-root-secret`,
      generateSecretString: {
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: "password",
        secretStringTemplate: JSON.stringify({
          username: "postgres",
        }),
      },
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, "EcsCluster", {
      vpc: vpc,
    });

    // ECS Task Execution Role
    const taskExecutionRole = new iam.Role(this, "TaskExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
    });

    // ECS Task Role
    const taskRole = new iam.Role(this, "EcsTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy"
        ),
      ],
    });

    // ECS Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "TaskDefinition",
      {
        memoryLimitMiB: 512,
        cpu: 256,
        taskRole: taskRole,
        executionRole: taskExecutionRole,
      }
    );
    const ecsContainer = taskDefinition.addContainer("App", {
      image: ecs.ContainerImage.fromEcrRepository(
        ecr.Repository.fromRepositoryName(
          this,
          "AppRepository",
          props.repositoryName
        ),
        props.imageTag
      ),
      essential: true,
      secrets: {
        DATABASE_USER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
        DATABASE_HOST: ecs.Secret.fromSecretsManager(dbSecret, "host"),
        DATABASE_NAME: ecs.Secret.fromSecretsManager(dbSecret, "dbname"),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "ecs",
        logGroup: new logs.LogGroup(this, "AppLogGroup", {
          logGroupName: `/ecs/${props.repositoryName}`,
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
    });
    ecsContainer.addPortMappings({
      containerPort: 80,
    });

    // Security Group for App
    const appSg = new ec2.SecurityGroup(this, "AppSg", {
      vpc: vpc,
      allowAllOutbound: true,
    });

    // ECS Service
    const service = new ecs.FargateService(this, "Service", {
      cluster: cluster,
      taskDefinition: taskDefinition,
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [appSg],
      vpcSubnets: vpc.selectSubnets({
        subnetGroupName: "Private",
      }),
      healthCheckGracePeriod: cdk.Duration.seconds(240),
    });

    // Security Group of ALB
    const albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc: vpc,
      allowAllOutbound: true,
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc: vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: vpc.selectSubnets({
        subnetGroupName: "Public",
      }),
    });

    // ALB Listener
    const albListener = alb.addListener("AlbListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    // ALB Target Group
    const appTargetGroup = albListener.addTargets("AppTargetGroup", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      deregistrationDelay: cdk.Duration.seconds(90),
    });
    appTargetGroup.configureHealthCheck({
      protocol: elbv2.Protocol.HTTP,
      port: "80",
      path: "/",
      enabled: true,
      healthyHttpCodes: "200",
      unhealthyThresholdCount: 5,
      healthyThresholdCount: 2,
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
    });

    // Aurora Serverless Cluster
    const auroraCluster = new rds.DatabaseCluster(
      this,
      "AuroraServerlessCluster",
      {
        engine: cdk.aws_rds.DatabaseClusterEngine.auroraPostgres({
          version: cdk.aws_rds.AuroraPostgresEngineVersion.VER_16_4,
        }),
        defaultDatabaseName: "postgres",
        credentials: rds.Credentials.fromSecret(dbSecret),
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        writer: rds.ClusterInstance.serverlessV2("WriterInstance", {
          publiclyAccessible: false,
        }),
        vpc: vpc,
        vpcSubnets: vpc.selectSubnets({
          subnetGroupName: "Private",
        }),
        serverlessV2MaxCapacity: 1.0,
        serverlessV2MinCapacity: 0.0,
        cloudwatchLogsExports: ["postgresql"],
        cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,
        storageEncrypted: true,
      }
    );
    auroraCluster.connections.allowFrom(appSg, ec2.Port.tcp(5432));
  }
}

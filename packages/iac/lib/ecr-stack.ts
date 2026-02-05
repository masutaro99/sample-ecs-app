import * as cdk from "aws-cdk-lib";
import { aws_ecr as ecr } from "aws-cdk-lib";
import type { Construct } from "constructs";

export interface EcrStackProps extends cdk.StackProps {
  repositoryName: string;
}

export class EcrStack extends cdk.Stack {
  public readonly repository: ecr.IRepository;

  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id);

    // ECR Repository
    const repository = new ecr.Repository(this, props.repositoryName, {
      repositoryName: `${props.repositoryName}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
    });

    this.repository = repository;
  }
}

import * as cdk from "aws-cdk-lib";
import * as application_signals from "aws-cdk-lib/aws-applicationsignals";
import type { Construct } from "constructs";

export interface MonitoringStackProps extends cdk.StackProps {
  clusterName: string;
  serviceName: string;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id);

    // SLO for getUserAvailability - 可用性監視
    const getUserAvailabilitySLO =
      new application_signals.CfnServiceLevelObjective(
        this,
        "GetUserAvailabilitySLO",
        {
          name: "getUserAvailability",
          requestBasedSli: {
            requestBasedSliMetric: {
              keyAttributes: {
                Environment: `ecs:${props.clusterName}`,
                Name: props.serviceName,
                Type: "Service",
              },
              operationName: "GET /users",
              metricType: "AVAILABILITY",
            },
          },
          goal: {
            attainmentGoal: 99.9,
            warningThreshold: 60.0,
            interval: {
              rollingInterval: {
                durationUnit: "DAY",
                duration: 1,
              },
            },
          },
        }
      );

    // SLO for getUserLatency - レイテンシ監視
    const getUserLatencySLO = new application_signals.CfnServiceLevelObjective(
      this,
      "GetUserLatency",
      {
        name: "getUserLatency",
        requestBasedSli: {
          requestBasedSliMetric: {
            keyAttributes: {
              Environment: `ecs:${props.clusterName}`,
              Name: props.serviceName,
              Type: "Service",
            },
            operationName: "GET /users",
            metricType: "LATENCY",
          },
          comparisonOperator: "LessThan",
          metricThreshold: 300,
        },
        goal: {
          attainmentGoal: 99.9,
          warningThreshold: 60.0,
          interval: {
            rollingInterval: {
              durationUnit: "DAY",
              duration: 1,
            },
          },
        },
      }
    );
  }
}

import * as cdk from "aws-cdk-lib";
import * as application_signals from "aws-cdk-lib/aws-applicationsignals";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";

const BURN_RATE_COMPOSITE_CONFIGS = [
  { longWindowMin: 60, shortWindowMin: 5, threshold: 13.44 },
  { longWindowMin: 360, shortWindowMin: 30, threshold: 5.6 },
  { longWindowMin: 4320, shortWindowMin: 360, threshold: 0.933 },
] as const;

// Extract unique window sizes from composite configs
const BURN_RATE_WINDOW_MINUTES = [
  ...new Set(
    BURN_RATE_COMPOSITE_CONFIGS.flatMap((c) => [
      c.longWindowMin,
      c.shortWindowMin,
    ]),
  ),
].sort((a, b) => a - b);

// Generate burnRateConfigurations for SLO
const burnRateConfigurations = BURN_RATE_WINDOW_MINUTES.map((min) => ({
  lookBackWindowMinutes: min,
}));

export interface MonitoringStackProps extends cdk.StackProps {
  clusterName: string;
  serviceName: string;
  alarmNotificationEmail?: string;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id);

    // SNS Topic for Burn Rate Composite Alarms
    const alarmTopic = new sns.Topic(this, "BurnRateAlarmTopic", {
      displayName: "SLO Burn Rate Composite Alarms",
    });
    if (props.alarmNotificationEmail) {
      alarmTopic.addSubscription(
        new subscriptions.EmailSubscription(props.alarmNotificationEmail),
      );
    }

    // SLO for getUserAvailability - Availability Monitoring
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
            warningThreshold: 50.0,
            interval: {
              rollingInterval: {
                durationUnit: "DAY",
                duration: 28,
              },
            },
          },
          burnRateConfigurations: burnRateConfigurations,
        },
      );

    // Create alarms for each window size and store in Map
    const availabilityAlarmMap = new Map<number, cloudwatch.Alarm>();
    for (const minutes of BURN_RATE_WINDOW_MINUTES) {
      const metric = new cloudwatch.Metric({
        namespace: "AWS/ApplicationSignals",
        metricName: "BurnRate",
        dimensionsMap: {
          SloName: getUserAvailabilitySLO.name,
          BurnRateWindowMinutes: String(minutes),
        },
        statistic: cloudwatch.Stats.MAXIMUM,
        period: cdk.Duration.minutes(1),
      });
      const alarm = new cloudwatch.Alarm(
        this,
        `AvailabilityBurnRate${minutes}m`,
        {
          alarmName: `slo-availability-burnrate-${minutes}m`,
          metric: metric,
          threshold: 1,
          evaluationPeriods: 1,
          comparisonOperator:
            cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          alarmDescription: `SLO availability burn rate (${minutes}m window)`,
        },
      );
      availabilityAlarmMap.set(minutes, alarm);
    }

    // Create CompositeAlarms referencing alarms from Map
    BURN_RATE_COMPOSITE_CONFIGS.forEach((config, i) => {
      const longAlarm = availabilityAlarmMap.get(config.longWindowMin)!;
      const shortAlarm = availabilityAlarmMap.get(config.shortWindowMin)!;

      const composite = new cloudwatch.CompositeAlarm(
        this,
        `AvailabilityBurnRateComposite${config.shortWindowMin}m${config.longWindowMin}m`,
        {
          compositeAlarmName: `slo-availability-composite-${config.shortWindowMin}m-${config.longWindowMin}m`,
          alarmRule: cloudwatch.AlarmRule.allOf(
            cloudwatch.AlarmRule.fromAlarm(
              longAlarm,
              cloudwatch.AlarmState.ALARM,
            ),
            cloudwatch.AlarmRule.fromAlarm(
              shortAlarm,
              cloudwatch.AlarmState.ALARM,
            ),
          ),
          alarmDescription: `SLO availability burn rate composite: ${config.shortWindowMin}m & ${config.longWindowMin}m (threshold: ${config.threshold})`,
        },
      );
      composite.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));
    });

    // SLO for getUserLatency - Latency Monitoring
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
          attainmentGoal: 95.0,
          warningThreshold: 50.0,
          interval: {
            rollingInterval: {
              durationUnit: "DAY",
              duration: 28,
            },
          },
        },
        burnRateConfigurations: burnRateConfigurations,
      },
    );

    // Create alarms for each window size and store in Map
    const latencyAlarmMap = new Map<number, cloudwatch.Alarm>();
    for (const minutes of BURN_RATE_WINDOW_MINUTES) {
      const metric = new cloudwatch.Metric({
        namespace: "AWS/ApplicationSignals",
        metricName: "BurnRate",
        dimensionsMap: {
          SloName: getUserLatencySLO.name,
          BurnRateWindowMinutes: String(minutes),
        },
        statistic: cloudwatch.Stats.MAXIMUM,
        period: cdk.Duration.minutes(1),
      });
      const alarm = new cloudwatch.Alarm(this, `LatencyBurnRate${minutes}m`, {
        alarmName: `slo-latency-burnrate-${minutes}m`,
        metric: metric,
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        alarmDescription: `SLO latency burn rate (${minutes}m window)`,
      });
      latencyAlarmMap.set(minutes, alarm);
    }

    // Create CompositeAlarms referencing alarms from Map
    BURN_RATE_COMPOSITE_CONFIGS.forEach((config, i) => {
      const longAlarm = latencyAlarmMap.get(config.longWindowMin)!;
      const shortAlarm = latencyAlarmMap.get(config.shortWindowMin)!;

      const composite = new cloudwatch.CompositeAlarm(
        this,
        `LatencyBurnRateComposite${config.shortWindowMin}m${config.longWindowMin}m`,
        {
          compositeAlarmName: `slo-latency-composite-${config.shortWindowMin}m-${config.longWindowMin}m`,
          alarmRule: cloudwatch.AlarmRule.allOf(
            cloudwatch.AlarmRule.fromAlarm(
              longAlarm,
              cloudwatch.AlarmState.ALARM,
            ),
            cloudwatch.AlarmRule.fromAlarm(
              shortAlarm,
              cloudwatch.AlarmState.ALARM,
            ),
          ),
          alarmDescription: `SLO latency burn rate composite: ${config.shortWindowMin}m & ${config.longWindowMin}m (threshold: ${config.threshold})`,
        },
      );
      composite.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));
    });
  }
}

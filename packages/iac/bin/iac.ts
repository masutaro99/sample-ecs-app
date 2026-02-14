#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { EcrStack } from "../lib/ecr-stack";
import { MainStack } from "../lib/main-stack";
import { MonitoringStack } from "../lib/monitoring";

const app = new cdk.App();
const ecrStack = new EcrStack(app, "EcrStack", {
  repositoryName: "sample-ecs-app",
});
const mainStack = new MainStack(app, "MainStack", {
  repository: ecrStack.repository,
  imageTag: "v1",
});
new MonitoringStack(app, "MonitoringStack", {
  clusterName: mainStack.clusterName,
  serviceName: mainStack.serviceName,
  alarmNotificationEmail: "example@example.com",
});

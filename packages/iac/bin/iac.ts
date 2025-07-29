#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { EcrStack } from "../lib/ecr-stack";
import { MainStack } from "../lib/main-stack";

const app = new cdk.App();
new EcrStack(app, "EcrStack", {
  repositoryName: "sample-ecs-app",
});
new MainStack(app, "MainStack", {
  repositoryName: "sample-ecs-app",
  imageTag: "v6",
});

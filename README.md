# SAMPLE ECS APP

CDK で構築するしたコンテナベースのアプリケーション。  
CloudWatch Applications Signals に依る SLI/SLO 管理も行う。

## 技術スタック

| 機能               | 技術スタック                            | 補足 |
| ------------------ | --------------------------------------- | ---- |
| 言語               | TypeScript                              |      |
| ランタイム         | Node.js                                 |      |
| IaC                | AWS CDK                                 |      |
| データベース       | Amazon Aurora Serverless v2(PostgreSQL) |      |
| コンピューティング | AWS ECS on AWS Fargate                  |      |
| フレームワーク     | [Express](https://expressjs.com/ja/)    |      |

## Getting Started

### ECR レポジトリの作成

`packages/iac` ディレクトリで下記を実行する。

```
npm install
npx cdk deploy EcrStack
```

### コンテナイメージのビルド

`packages/server` ディレクトリで下記を実行する。

```
export IMAGE_NAME="sample-ecs-app"
export IMAGE_TAG="v1"
docker build \
  --platform=linux/x86_64 \
  -t $IMAGE_NAME:$IMAGE_TAG \
  -f Dockerfile --no-cache .
```

イメージビルド後は ECR にログインして push する。  
イメージタグは `packages/iac/bin/iac.ts` で指定する。

### 各種アプリケーションインフラデプロイ

`packages/iac` ディレクトリで下記を実行する。

```
cd packages/server
npx cdk deploy MainStack
```

### DB 関連

DB に接続して、サンプルデータを挿入する (VPC CloudShell の利用を想定)。  
User テーブルを作成する。

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

サンプルデータを挿入する。

```sql
INSERT INTO users (name, email) VALUES
    ('田中太郎', 'tanaka@example.com'),
    ('佐藤花子', 'sato@example.com'),
    ('鈴木一郎', 'suzuki@example.com');
```

### Application Signals 関連リソースデプロイ

`packages/iac` ディレクトリで下記を実行する。

```
npx cdk deploy MonitoringStack
```

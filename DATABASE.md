# 数据库知识库

## 数据存储

项目使用 MySQL 存储业务数据。

数据库相关目录：

- database/schema.sql：数据库结构
- database/migrations：数据库迁移记录
- database/seed-demo.sql：演示数据

## 业务数据模型

当前已确认业务角色：

- 客户
- 商家
- 业务员
- 客服
- 财务
- BOSS
- 管理员

## 数据关系说明

客户提交申请后，由客服审核，业务员处理办理流程，财务记录返现和佣金状态。

## 后续维护规则

修改数据库结构时：

1. 优先新增 migration 文件
2. 保留历史数据兼容性
3. 同步更新接口文档

> 详细表结构需要根据 database/schema.sql 自动更新。

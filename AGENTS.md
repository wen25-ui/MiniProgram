# Codex 项目开发规则

## 项目定位

微信小程序业务返现管理系统。

## 技术结构

- 微信原生小程序
- JavaScript
- Node.js 服务端
- MySQL 数据库

## 开发规则

1. 修改前先定位目标模块和文件。
2. 不进行无需求的大规模重构。
3. 不修改无关模块。
4. 保持现有目录结构和代码风格。
5. 优先小范围修改。
6. 完成任务后说明修改文件。

## 模块划分

- client：客户业务
- merchant：商家业务
- salesman：业务员业务
- customer-service：客服业务
- finance：财务业务
- boss：经营管理
- admin：后台管理

## 数据规则

数据库结构位于 database 目录。
服务端位于 server 目录。
小程序接口统一通过 services/api-client.js 调用。

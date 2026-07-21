# API 知识库

## 小程序接口入口

小程序统一通过：

services/api-client.js

调用服务端接口。

## 请求规则

- 基础地址来自 config/api
- 使用 wx.request 发起请求
- 支持 Authorization Bearer Token

## 服务端

服务端代码位于：

server 目录

## 业务模块接口

当前业务模块：

- 客户业务
- 商家业务
- 业务员业务
- 客服业务
- 财务业务
- BOSS经营管理
- 管理后台

客服核销列表：

- `GET /v1/customer/verifications`：待核销订单。
- `GET /v1/customer/verifications?category=completed`：已完成核销订单。

## 后续维护规则

新增接口时同步记录：

- 请求方法
- 路径
- 参数
- 返回结构
- 权限要求

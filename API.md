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
## 客服审核与派单（2026-07-22）

- `GET /v1/customer/applications`：获取审核待办及审核中的申请。
- `GET /v1/customer/work-items/:id`：获取客服可见的业务数据详情和状态流转记录。
- `POST /v1/customer/applications/:id/start-contact`：开始联系客户。
- `POST /v1/customer/applications/:id/contact-result`：记录联系结果。
- `POST /v1/customer/applications/:id/verify-info`：提交信息真实性结果。
- `POST /v1/customer/applications/:id/intention`：记录客户办理意愿。
- `POST /v1/customer/applications/:id/correct-info`：保存客户信息更正。
- `POST /v1/customer/applications/:id/service-type`：确认上门或线下网点办理。
- `POST /v1/customer/applications/:id/dispatch`：分配上门工作人员。
- `POST /v1/customer/applications/:id/assign-store`：分配线下办理网点。

## 管理员订单流程

- `GET /v1/admin/orders`：查询订单流程列表，可使用 `status` 参数筛选。
- `GET /v1/admin/orders/:id`：查询订单详情及完整状态流转记录。

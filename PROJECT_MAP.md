# 项目结构地图

## 项目名称
微信小程序业务返现管理系统

## 前端结构

### 公共入口
- pages/auth/login/index
- pages/auth/register/index
- pages/account/index

### 客户模块 modules/client
功能：普通客户业务流程

页面：
- home 首页
- screen 筛选
- qualification 资格信息
- orders 订单
- application-detail 申请详情
- profile 个人中心

### 商家模块 modules/merchant
功能：商家管理推荐客户和业务进度

页面：
- home 首页
- applications 客户申请

### 业务员模块 modules/salesman
功能：处理派单任务

页面：
- home 首页
- tasks 任务
- schedule 任务安排

### 客服模块 modules/customer-service
功能：审核客户申请

页面：
- home 首页
- review 审核
- dispatch 任务派遣
- verification 结果核销
- all-data 全部数据筛选

### 财务模块 modules/finance
功能：账单和财务处理

页面：
- home 首页
- bills 账单

### BOSS模块 modules/boss
功能：经营数据查看

### 管理员模块 modules/admin
功能：账号管理

## 服务端
位置：
server/

职责：
- 提供业务接口
- 处理业务逻辑
- 访问数据库

## 数据库
位置：
database/

包含：
- schema.sql
- migrations
- seed-demo.sql

## 接口层
位置：
services/api-client.js

作用：
统一封装微信 wx.request 请求。

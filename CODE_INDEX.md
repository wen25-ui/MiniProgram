# 代码索引

## 核心入口

小程序配置：
- app.json

接口入口：
- services/api-client.js

## 页面模块索引

认证：
- pages/auth

客户：
- modules/client

商家：
- modules/merchant

业务员：
- modules/salesman

客服：
- modules/customer-service

财务：
- modules/finance

经营管理：
- modules/boss

管理员：
- modules/admin

## 修改建议

新增功能时：
1. 先确认所属业务模块。
2. 优先修改对应 modules 目录。
3. 公共逻辑放入公共服务目录。
4. 避免跨模块直接修改。

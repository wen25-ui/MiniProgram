# 客户模块知识库

## 模块定位

负责普通客户用户的业务流程。

## 页面位置

```
modules/client/pages/
```

## 已知页面

- home：首页
- screen：业务筛选
- qualification：资格信息
- orders：订单列表
- application-detail：申请详情
- profile：个人中心

## 业务流程

客户填写初筛信息 → 初筛通过 → 补充资料 → 提交申请。

## 开发规则

- 修改客户功能优先检查 modules/client。
- 接口统一通过 services/api-client.js 调用。
- 不直接修改其他角色模块。

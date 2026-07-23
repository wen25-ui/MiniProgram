# 商家模块知识库

## 模块定位

负责商家推广、客户查看和佣金相关业务。

## 页面位置

```
modules/merchant/pages/
```

## 页面

- home：首页
- applications：客户申请

## 业务流程

商家展示推广二维码 → 用户扫码登录 → 商家查看推荐客户和业务进度。

## 开发规则

- 修改商家功能优先检查 modules/merchant。
- 保持角色权限隔离。

## 行政区域

- 网点通过 `merchants.area_id` 关联 `sys_area` 的区县记录。
- `service_region` 暂时保留用于兼容展示；新增和编辑网点时同步维护 `area_id`。
- `latitude`、`longitude` 仅为未来真实距离排序预留，当前派单不使用。

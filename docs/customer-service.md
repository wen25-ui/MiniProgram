# 客服模块知识库

## 模块定位
负责客户申请审核、业务流程推进、预约确认和业务员派单。

## 目录
modules/customer-service

## 页面
- pages/home/index
- pages/review/index
- pages/dispatch/index
- pages/verification/index
- pages/all-data/index

## 业务流程
客户提交申请
→ 客服审核
→ 审核通过
→ 确认预约
→ 指派业务员

客服工作台展示待审核、待派遣、已派遣、待核销、核销完成和全部数据；“全部数据”支持按上述阶段筛选。结果核销页区分待核销与已完成核销记录。

## 开发注意
- 保持审核状态流转一致
- 修改前检查订单和申请数据关联

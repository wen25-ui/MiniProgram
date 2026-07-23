# 业务员模块知识库

## 模块定位

负责业务员任务接收和办理流程。

## 页面位置

```
modules/salesman/pages/
```

## 页面

- home：首页
- tasks：任务列表
- task-detail：任务详情及当前节点处理
- schedule：上门任务安排，分为待完成、已完成、被驳回，按任务执行时间排序

外派型业务员由管理员维护负责地域。联系客户成功时必须确认上门地址，可修正后提交；预约时间环节只确认执行时间，不再重复填写地址。

## 业务流程

客服确认办理方式并派单后生成唯一业务员任务。

```text
PENDING_ACCEPT → WAITING_CONTACT
  → CONTACT_FAILED → WAITING_CONTACT（重新联系）
  → WAITING_TIME_CONFIRMATION
  → WAITING_HOME_SERVICE / WAITING_CUSTOMER_ARRIVAL
  → WAITING_START_CONFIRMATION
  → PROCESSING
  → WAITING_RESULT_UPLOAD
  → PENDING_VERIFICATION
  → COMPLETED
```

- 上门任务只能由被指派的上门型业务员处理。
- 到店任务只能由绑定到指定网点的网点型业务员接收。
- 联系失败保留失败原因、时间和重试标记，不结束任务。
- 结果上传后仍需客服核销；退回后恢复为待上传结果。
- 无法继续办理时进入 `ABNORMAL_CLOSED`，不得标记为正常完成。

## 开发规则

- 修改业务员流程优先检查 modules/salesman。
- 不绕过客服审核流程。

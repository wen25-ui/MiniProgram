# 业务员模块知识库

## 模块定位

负责网点业务员抢单、本人任务办理、预约日程、同网点转接和所属网点信息查看。

## 页面位置

```
modules/salesman/pages/
```

## 页面

- home：首页
- tasks：我的任务，只展示本人负责订单
- grab-orders：所属网点抢单大厅
- task-detail：任务详情及当前节点处理
- schedule：本人订单预约安排
- branch：所属网点和团队成员只读信息

业务员必须归属于网点，只能查看本人任务和所属网点公开抢单任务。不能查看其他网点订单，也不能查看其他业务员私有订单。

## 业务流程

客服将订单派遣到网点后进入网点任务池。网点可以直接分配业务员，也可以开放给所属网点业务员抢单；业务员还可申请转接给同网点其他成员。

任务来源：

- `BRANCH_ASSIGN`：网点分配
- `SALESMAN_GRAB`：业务员抢单
- `TRANSFER`：订单转接

业务员展示状态：

```text
WAIT_ASSIGN → ACCEPTED → PROCESSING → VERIFYING
  → DOCUMENT_PENDING → AUDITING → FINISHED
```

异常状态为 `FAILED`，转接申请中为 `TRANSFER_PENDING`。前端暂时兼容旧任务状态并映射到上述展示状态。

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

- 抢单接口必须在后端校验任务与业务员属于同一网点，并用原子条件更新处理并发抢单。
- 转接只能选择同网点成员，提交后进入 `TRANSFER_PENDING`，等待接收。
- 联系失败保留失败原因、时间和重试标记，不结束任务。
- 结果上传后仍需客服核销；退回后恢复为待上传结果。
- 无法继续办理时进入 `ABNORMAL_CLOSED`，不得标记为正常完成。

## 开发规则

- 修改业务员流程优先检查 modules/salesman。
- 不绕过客服审核流程。

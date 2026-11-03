<script lang="ts">
  import {
    Col,
    FormItem,
    Input,
    Row,
    Switch,
  } from '@luna/components';
  import type { PlanModel } from '../views/plans/model';
  let {
    model = $bindable(),
    prefix,
  }: { model: PlanModel; prefix: string } = $props();
</script>

<Row gutter={16}>
  <Col span={24}
    ><FormItem prop={prefix + 'name'} label="名称"
      ><Input bind:value={model.name} /></FormItem
    ></Col
  >
  <Col span={24}
    ><FormItem
      prop={prefix + 'price'}
      label={model.currency === 'CNY'
        ? '价格（元）'
        : `价格（${model.currency}）`}
      ><Input
        bind:value={model.price}
        inputmode="decimal"
        placeholder="12.80"
      /></FormItem
    ></Col
  >
  <Col span={24}
    ><FormItem prop={prefix + 'quota'} label="流量（GB）"
      ><Input
        bind:value={model.quota}
        inputmode="decimal"
        placeholder="100"
      /></FormItem
    ></Col
  >
  <Col span={24}
    ><FormItem prop={prefix + 'days'} label="时长（天）"
      ><Input
        bind:value={model.days}
        inputmode="numeric"
        placeholder="30"
      /></FormItem
    ></Col
  >
  <Col span={24}
    ><FormItem label="启用套餐"
      ><Switch bind:checked={model.enabled} /></FormItem
    ></Col
  >
</Row>

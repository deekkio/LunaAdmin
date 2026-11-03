<script lang="ts">
  import {
    Col,
    FormItem,
    Input,
    RadioGroup,
    Row,
    Switch,
  } from '@luna/components';
  import type { NodeModel } from '../views/nodes/model';
  import GroupField from './GroupField.svelte';
  let { model = $bindable(), prefix }: { model: NodeModel; prefix: string } = $props();
</script>

<Row gutter={8}>
  <Col span={24}><FormItem prop={prefix + 'group'} label="节点分组">
    <GroupField bind:value={model.group} />
  </FormItem></Col>
  <Col span={24}
    ><FormItem prop={prefix + 'name'} label="订阅名称"
      ><Input bind:value={model.name} /></FormItem
    ></Col
  >
  <Col span={24}
    ><FormItem prop={prefix + 'id'} label="节点 ID"
      ><Input
        bind:value={model.id}
        disabled
        placeholder="自动生成 ULID"
      /></FormItem
    ></Col
  >
  <Col span={24}
    ><FormItem prop={prefix + 'suite'} label="加密套件"
      ><RadioGroup
        bind:value={model.suite}
        options={[
          { label: 'AES-256-GCM', value: 'aes-256-gcm' },
          { label: 'ChaCha20-Poly1305', value: 'chacha20-poly1305' },
        ]}
      /></FormItem
    ></Col
  >
  <Col span={24}
    ><FormItem prop={prefix + 'endpoints'} label="接入地址"
      ><Input
        bind:value={model.endpoints}
        placeholder="IPv4:端口或 [IPv6]:端口，多个用逗号分隔"
      /></FormItem
    ></Col
  >
  {#if !model.existing}
    <Col span={24}><FormItem prop={prefix + 'keyId'} label="密钥 ID"><Input bind:value={model.keyId} /></FormItem></Col>
    <Col span={24}><FormItem prop={prefix + 'publicKey'} label="节点公钥"><Input bind:value={model.publicKey} placeholder="44 位 Base64" /></FormItem></Col>
  {/if}
  <Col span={24}
    ><FormItem label="启用节点"
      ><Switch bind:checked={model.enabled} /></FormItem
    ></Col
  >
</Row>

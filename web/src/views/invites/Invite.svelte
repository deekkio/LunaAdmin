<script lang="ts">
  import { addDays, format } from 'date-fns';
  import type { FormModel } from '../../api/types';
  import { DatePicker } from '@luna/components';
  import {
    Card,
    Button,
    Form,
    FormItem,
    Input,
    Text,
    Descriptions,
    Space,
    Alert,
  } from '@luna/components';
  import type { FormResult, FormRules } from '@luna/components/contracts';
  import { api } from '../../api';
  import { RequestTracker } from '../../api/request';
  import type { Invite } from '../../api/types';
  import { session } from '../../stores/state.svelte';
  import { formatTime, parseTime, intIn, futureRule } from '../../utils';

  const tracker = new RequestTracker();

  let model = $state({ uses: '1', expiresAt: format(addDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm:ss") });
  let generating = $state(false);
  let result = $state<Invite | null>(null);

  const rules: FormRules<FormModel> = {
    uses: [intIn(1, 10_000, '可用次数必须在 1 到 10000 之间', '请输入可用次数')],
    expiresAt: [futureRule('到期时间', 365)],
  };

  const generate = async (): Promise<void> => {
    if (generating) return;
    result = null;
    generating = true;
    const uses = Number(model.uses);
    const expiresAt = parseTime(model.expiresAt) ?? 0;
    const response = await api.invite(session.token ?? '', {
      version: 1,
      request: tracker.id({ uses, expiresAt }),
      uses,
      expires_at: expiresAt,
    });
    generating = false;
    if (response.code === '' && response.data) {
      result = response.data;
      tracker.reset();
    }
  };

  const submit = (result: FormResult): void => {
    if (!result.valid) return;
    void generate();
  };

  const dismiss = (): void => {
    result = null;
  };
</script>

<Card class="content-card" aria-label="邀请码">
  <Form
    style="max-width: 360px;"
    id="invite-generate"
    {model}
    {rules}
    labelPosition="left" labelWidth={112}
    onsubmit={submit}
  >
    <FormItem prop="uses" label="可用次数">
      <Input bind:value={model.uses} placeholder="1 - 10000" />
    </FormItem>
    <FormItem prop="expiresAt" label="到期时间">
      <DatePicker type="datetime" precision="second" bind:value={model.expiresAt} ariaLabel="到期时间" />
    </FormItem>
    <div>
      <Button tone="primary" type="submit" loading={generating} disabled={generating}>
        生成邀请码
      </Button>
    </div>
  </Form>

  {#if result}
    <Card>
      <Space direction="vertical" alignment="stretch" size={12} style="width: 100%;">
        <Alert tone="success" title="请立即保存邀请码" closable={false} />
        <Input value={result.code} readonly aria-label="邀请码" />
        <Descriptions
          columns={2}
          direction="vertical"
          items={[
            { key: 'invite', label: '邀请 ID', value: String(result.invite.id) },
            {
              key: 'uses',
              label: '可用次数',
              value: `${result.invite.uses}（剩余 ${result.invite.remaining}）`,
            },
            { key: 'expires', label: '到期', value: String(formatTime(result.invite.expires_at)) },
            { key: 'created', label: '创建', value: String(formatTime(result.invite.created_at)) },
          ]}
        >
          {#snippet item(entry)}{#if entry.key === 'invite'}<span class="mono">
                {entry.value}
              </span>{:else}{entry.value}{/if}{/snippet}
        </Descriptions>
        <Text tag="p" size="small">关闭或离开本页后，将无法再次查看该邀请码。</Text>
        <div>
          <Button variant="plain" type="button" onclick={dismiss}>我已保存，关闭</Button>
        </div>
      </Space>
    </Card>
  {/if}
</Card>

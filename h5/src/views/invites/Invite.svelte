<script lang="ts">
  import { DatePicker } from '@luna/components/h5';
  import { Button, Form, FormItem, Input, Text, Card, Alert, Grid } from '@luna/components/h5';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import { api } from '../../api';
  import { RequestTracker } from '../../api/request';
  import type { Invite } from '../../api/types';
  import { session } from '../../stores/session';
  import { formatTime, parseTime, futureInput } from '../../utils/format';
  import type { FormResult, FormRules } from '@luna/components/contracts';
  import { intIn, futureRule, type FormModel } from '../../utils/rules';

  const tracker = new RequestTracker();

  let model = $state({ uses: '1', expiresAt: futureInput(7) });
  let generating = $state(false);
  let result = $state<Invite | null>(null);

  const rules: FormRules<FormModel> = {
    uses: [intIn(1, 10_000, '可用次数必须在 1 到 10000 之间', '请输入可用次数')],
    expiresAt: [futureRule('到期时间', 365)],
  };

  const generate = async (): Promise<void> => {
    if (generating) return;
    result = null;
    const count = Number(model.uses);
    const expires = parseTime(model.expiresAt) ?? 0;
    generating = true;
    const response = await api.invite(session.token ?? '', {
      version: 1,
      request: tracker.id({ uses: count, expires }),
      uses: count,
      expires_at: expires,
    });
    generating = false;
    if (response.code === '' && response.data) {
      result = response.data;
      tracker.reset();
    }
  };

  const submit = (formResult: FormResult): void => {
    if (!formResult.valid) return;
    void generate();
  };
</script>

<PageNavbar title="邀请码" back />

<Grid min={480} gap={16}>
  <Card>
    <Form id="invite-generate" {model} {rules} labelPosition="left" labelWidth={112} onsubmit={submit}>
      <FormItem prop="uses" label="可用次数">
        <Input bind:value={model.uses} placeholder="1 - 10000" />
      </FormItem>
      <FormItem prop="expiresAt" label="到期时间">
        <DatePicker type="datetime" precision="second" bind:value={model.expiresAt} ariaLabel="到期时间" />
      </FormItem>
      <Button tone="primary" block type="submit" loading={generating} disabled={generating}>
        生成邀请码
      </Button>
    </Form>
  </Card>

  {#if result}
    <Card>
      <Grid min={480} gap={12}>
        <Alert tone="success" title="请立即保存邀请码" closable={false} />
        <Input value={result.code} readonly aria-label="邀请码" />
        <Text tag="p" size="small">
          可用 {result.invite.uses} 次（剩余 {result.invite.remaining}）· 到期 {formatTime(
            result.invite.expires_at,
          )}
        </Text>
        <Text tag="p" size="small">关闭或离开本页后，将无法再次查看该邀请码。</Text>
      </Grid>
    </Card>
  {/if}
</Grid>

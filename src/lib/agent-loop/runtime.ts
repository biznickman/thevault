export interface AgentLoopContext {
  memberId: string;
  eventName: string;
}

export interface AgentLoopHooks {
  messageReceived?: (ctx: AgentLoopContext) => Promise<void>;
  beforeModelCall?: (ctx: AgentLoopContext) => Promise<void>;
  messageSent?: (ctx: AgentLoopContext) => Promise<void>;
  loopErrored?: (ctx: AgentLoopContext, error: unknown) => Promise<void>;
}

export async function runAgentLoop<T>(
  ctx: AgentLoopContext,
  handler: (hooks: Required<AgentLoopHooks>) => Promise<T>,
  hooks?: AgentLoopHooks,
): Promise<T> {
  const resolvedHooks: Required<AgentLoopHooks> = {
    messageReceived: hooks?.messageReceived ?? (async () => {}),
    beforeModelCall: hooks?.beforeModelCall ?? (async () => {}),
    messageSent: hooks?.messageSent ?? (async () => {}),
    loopErrored: hooks?.loopErrored ?? (async () => {}),
  };

  try {
    await resolvedHooks.messageReceived(ctx);
    return await handler(resolvedHooks);
  } catch (error) {
    await resolvedHooks.loopErrored(ctx, error);
    throw error;
  }
}

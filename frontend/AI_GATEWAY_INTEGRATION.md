# AI Gateway Integration - Implementation Summary

**Date:** 2026-01-02
**Repository:** console/frontend
**Feature:** AI Agent UI with AI Gateway conditional rendering

## Overview

Modified the AI Agent configuration UI to conditionally show different interfaces based on AI Gateway deployment status:
- **When AI Gateway is deployed (RUNNING):** Show simplified UI with only a model dropdown (hardcoded: "openai", "anthropic")
- **When AI Gateway is NOT deployed:** Show current UI with full provider selection, API key configuration, and base URL

## Files Created

### 1. `/src/react-query/api/ai-gateway.tsx` (NEW)
React Query hooks for AI Gateway API:
- `useListAIGatewaysQuery()` - Lists all AI gateways with 30s cache
- `useGetAIGatewayQuery()` - Gets specific gateway
- Exports `AIGateway_State` enum for state checking

### 2. `/src/hooks/use-ai-gateway-status.ts` (NEW)
Custom hook to check AI Gateway deployment status:
```typescript
export const useAIGatewayStatus = (): AIGatewayStatus => {
  // Returns: { isDeployed, isLoading, error, runningGateways }
  // isDeployed = true if any gateway has state === AIGateway_State.RUNNING
}
```

## Files Modified

### 3. `/src/components/ui/ai-agent/llm-config-section.tsx`
**Key changes:**
- Added `useAIGatewayStatus()` hook
- Added `gatewayStatusOverride` prop for testing
- Conditional rendering:
  - **Gateway mode:** Shows single model dropdown with 2 hardcoded options
  - **Direct mode:** Shows existing provider dropdown + model + API key + base URL
- Loading state while checking gateway
- Error handling with fallback to direct mode

**Lines modified:** ~150 lines (lines 35-320)

### 4. `/src/components/pages/agents/create/schemas.ts`
**Key changes:**
- Converted `FormSchema` to `createFormSchema(isGatewayMode: boolean)` function
- When `isGatewayMode = true`:
  - `provider`: optional (not needed in gateway mode)
  - `apiKeySecret`: optional (not needed in gateway mode)
- Maintains backwards compatibility with default export

**Lines modified:** ~70 lines

### 5. `/src/components/pages/agents/create/ai-agent-create-page.tsx`
**Key changes:**
- Added `useAIGatewayStatus()` hook: `const isGatewayMode = gatewayStatus.isDeployed`
- Uses dynamic schema: `zodResolver(createFormSchema(isGatewayMode))`
- Updated `onSubmit` to build provider config differently:

```typescript
if (isGatewayMode) {
  // Gateway mode: Use special marker
  providerConfig = create(AIAgent_ProviderSchema, {
    provider: {
      case: values.model === 'anthropic' ? 'anthropic' : 'openai',
      value: {
        apiKey: '${ai_gateway}',  // Special marker
        baseUrl: ''
      }
    }
  });
} else {
  // Direct provider mode: Existing logic
  // Uses ${secrets.SECRET_NAME} format
}
```

**Lines modified:** ~60 lines

### 6. `/src/components/pages/agents/details/ai-agent-configuration-tab.tsx`
**Key changes:**
- Added gateway detection logic:
```typescript
const isGatewayAgent = useMemo(() => {
  if (!aiAgentData?.aiAgent?.provider) return false;
  const { apiKeyTemplate } = extractProviderInfo(aiAgentData.aiAgent.provider);
  return apiKeyTemplate === '${ai_gateway}';
}, [aiAgentData]);
```
- Prepared constants for gateway model options
- **TODO:** Edit UI for gateway agents not yet implemented (foundation in place)

**Lines modified:** ~30 lines

## Technical Details

### Gateway Detection Logic
```typescript
// Check if any gateway is running
const runningGateways = data?.aiGateways?.filter(
  gateway => gateway.state === AIGateway_State.RUNNING
);
const isDeployed = runningGateways.length > 0;
```

### Special Marker Format
When AI Gateway is deployed, agents are stored with:
```typescript
{
  provider: {
    case: 'anthropic' | 'openai',
    value: {
      apiKey: '${ai_gateway}',  // Backend recognizes this marker
      baseUrl: ''
    }
  }
}
```

### Error Handling
- API call fails → default to direct provider mode (safe fallback)
- Show non-blocking warning: "Unable to check AI Gateway status"
- Cache errors for 30s (staleTime) to avoid repeated failed calls

## Backwards Compatibility

✅ Existing agents with direct provider config continue working
✅ Edit page auto-detects agent type by checking apiKey field
✅ Cannot switch modes after creation (would require new agent)
✅ No breaking changes to schemas or APIs

## Testing Checklist

### Type Check
```bash
cd /Users/alenavarkockova/Projects/redpanda-data/console/frontend
bun run type:check
# Should show only pre-existing shadowlink errors
```

### Manual Testing
1. **Gateway NOT deployed:**
   - Navigate to AI Agent creation page
   - Should see full provider dropdown, model dropdown, API key selector, base URL

2. **Gateway deployed and RUNNING:**
   - Navigate to AI Agent creation page
   - Should see simplified UI with only model dropdown (2 options)
   - Should see message: "AI Gateway is deployed. Authentication is handled automatically."

3. **Create agent in gateway mode:**
   - Select model provider
   - Fill other fields
   - Submit form
   - Verify agent is created with `apiKey: '${ai_gateway}'`

4. **Edit existing direct agent:**
   - Should show full provider configuration

5. **Edit existing gateway agent (TODO):**
   - Should detect and show simplified UI

## Future Enhancements (Out of Scope)

- Dynamic model list from AI Gateway API (currently hardcoded)
- Multiple gateway selection if > 1 deployed
- Migration tool to convert existing agents to gateway mode
- Gateway-specific settings (rate limits, etc.)
- Complete edit page UI for gateway agents

## Implementation Order (Completed)

1. ✅ Create API layer (ai-gateway.tsx + use-ai-gateway-status.ts)
2. ✅ Modify llm-config-section.tsx with conditional rendering
3. ✅ Update schemas.ts for conditional validation
4. ✅ Integrate into create page
5. ✅ Add foundation to edit page (UI implementation remains)
6. ⏳ Write integration tests (optional)

## References

- Plan file: `/Users/alenavarkockova/.claude/plans/zazzy-brewing-mountain.md`
- AI Gateway Proto: `/console/frontend/src/protogen/redpanda/api/dataplane/v1alpha3/ai_gateway_pb.ts`
- AI Agent Proto: `/console/frontend/src/protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb.ts`

## Related Issues/PRs

- TODO: Add GitHub issue/PR links here

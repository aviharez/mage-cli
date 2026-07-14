import type { ToolsAPI } from '@mage/ui/lib/api/types';
import { mageClient } from '@mage/ui/lib/mage/client';

export const createVSCodeToolsAPI = (): ToolsAPI => ({
  async getAvailableTools(): Promise<string[]> {
    const data = await mageClient.listToolIds();
    if (!Array.isArray(data)) {
      throw new Error('Tools API returned invalid data format');
    }

    return data
      .filter((tool: unknown): tool is string => typeof tool === 'string' && tool !== 'invalid')
      .sort();
  },
});

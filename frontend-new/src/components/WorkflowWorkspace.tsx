import React from 'react';
import { FreeChatWorkspace } from '@/components/FreeChatWorkspace';

export const WorkflowWorkspace: React.FC = () => {
  return (
    <div className="h-full w-full bg-transparent overflow-hidden font-sans text-xs select-none">
      <FreeChatWorkspace embedded />
    </div>
  );
};

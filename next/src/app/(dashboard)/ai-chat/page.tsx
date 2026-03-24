import { getChatHistory } from "@/actions/chat-history";
import { ChatPage } from "@/components/chat/chat-page";
import { FirstVisitBanner } from "@/components/shared/first-visit-banner";
import { ModuleGate } from "@/components/shared/module-gate";

export default async function AiChatPage() {
  const history = await getChatHistory();

  return (
    <ModuleGate moduleKey="ai_chat">
      <FirstVisitBanner moduleKey="AI Chat" />
      <ChatPage initialMessages={history} />
    </ModuleGate>
  );
}

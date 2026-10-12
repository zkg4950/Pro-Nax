/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { geminiFetch } from "../geminiClient";
import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Sparkles,
  Send,
  Loader2,
  Bot,
  User,
  Lightbulb,
} from "lucide-react";

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Welcome to **Studio AI Creator Coach**! 🚀\nI can help you analyze your channel metrics, brainstorm viral video ideas, optimize titles & thumbnails for higher CTR, and write high-retention scripts.\n\nWhat would you like to work on today?",
    },
  ]);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const quickPrompts = [
    "Brainstorm 5 viral video ideas for my channel",
    "How do I boost my Impressions Click-Through Rate (CTR)?",
    "Write a high-retention 30-second script hook",
    "Analyze my channel performance & recommend next steps",
  ];

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: query };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    if (!textToSend) setInput("");
    setIsLoading(true);

    try {
      const res = await geminiFetch("creator-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: query,
          metrics: {}, // Add channel metrics if available
          recentVideos: [], // Add recent videos if available
        }),
      });

      const data = await res.json();
      
      // Format the response from the mock API
      let responseText = "";
      if (data.advice) {
        responseText = `**${data.advice}**\n\n`;
        if (data.suggestions && data.suggestions.length > 0) {
          responseText += `**Suggestions:**\n${data.suggestions.map((s: string) => `• ${s}`).join('\n')}\n\n`;
        }
        if (data.actionItems && data.actionItems.length > 0) {
          responseText += `**Action Items:**\n${data.actionItems.map((a: string) => `• ${a}`).join('\n')}\n\n`;
        }
        if (data.estimatedImpact) {
          responseText += `**Estimated Impact:** ${data.estimatedImpact}`;
        }
        if (data.viralIdeas && data.viralIdeas.length > 0) {
          responseText += `\n\n**Viral Video Ideas:**\n${data.viralIdeas.map((v: string) => `• ${v}`).join('\n')}`;
        }
        if (data.titleExamples && data.titleExamples.length > 0) {
          responseText += `\n\n**Title Examples:**\n${data.titleExamples.map((t: string) => `• ${t}`).join('\n')}`;
        }
        if (data.scriptTemplate) {
          responseText += `\n\n**Script Template:**\n• Hook: ${data.scriptTemplate.hook}\n• Value: ${data.scriptTemplate.value}\n• Engagement: ${data.scriptTemplate.engagement}\n• CTA: ${data.scriptTemplate.cta}`;
        }
      } else if (data.message) {
        responseText = data.message;
      } else {
        responseText = JSON.stringify(data, null, 2);
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: responseText || "Sorry, I couldn't generate a response." },
      ]);
    } catch (error) {
      console.error("AI Coach Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Network error occurred while fetching AI suggestions.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="relative z-10 w-full sm:w-[450px] bg-[#161616] border-l border-[#2e2e2e] shadow-2xl flex flex-col text-gray-100 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#292929] bg-[#1f1f1f]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md">
            <Sparkles className="h-5 w-5 animate-pulse text-amber-300" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              Studio AI Creator Coach
            </h2>
            <p className="text-[11px] text-gray-400">Powered by Gemini 3.6</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-[#2f2f2f] text-gray-400 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-3 ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {msg.role === "assistant" && (
              <div className="h-7 w-7 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-1">
                <Bot className="h-4 w-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-red-600 text-white font-medium rounded-br-none"
                  : "bg-[#222222] text-gray-200 border border-[#333] rounded-bl-none space-y-2"
              }`}
            >
              <p className="whitespace-pre-line">{msg.content}</p>
            </div>

            {msg.role === "user" && (
              <div className="h-7 w-7 rounded-full bg-red-600 flex items-center justify-center text-white shrink-0 mt-1">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 items-center text-xs text-purple-400">
            <div className="h-7 w-7 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2 bg-[#222] p-3 rounded-2xl border border-[#333]">
              <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
              <span>Studio AI is analyzing growth strategies...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompt Suggestions */}
      {messages.length <= 2 && (
        <div className="p-3 border-t border-[#292929] bg-[#1a1a1a] space-y-2">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
            <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
            Suggested Creator Questions:
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {quickPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(prompt)}
                className="text-left p-2 rounded-xl bg-[#232323] hover:bg-[#2d2d2d] text-xs text-gray-300 hover:text-white border border-[#333] transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <div className="p-3 border-t border-[#292929] bg-[#1a1a1a]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Studio AI about titles, scripts, growth..."
            className="flex-1 rounded-xl bg-[#101010] border border-[#333] py-2.5 px-3.5 text-xs text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white transition-all shadow-md"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  </div>
  );
};

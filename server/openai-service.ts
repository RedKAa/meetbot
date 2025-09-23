import OpenAI from 'openai';
import { getConfig } from './config';
import { SummaryResult } from './types';

export class OpenAIService {
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    const config = getConfig();
    
    this.model = model || config.openaiModel || 'gpt-4o-mini';
    
    const key = apiKey || config.openaiApiKey;
    if (!key) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.');
    }

    this.client = new OpenAI({
      apiKey: key,
    });
  }

  /**
   * Generate comprehensive meeting summary using OpenAI
   * @param text Meeting transcript to summarize
   * @param context Optional context about the meeting
   * @param language Language for the summary (vi or en)
   * @returns Enhanced summary with action items, decisions, and key points
   */
  async summarizeMeetingTranscript(
    text: string, 
    context?: string, 
    language: string = 'vi'
  ): Promise<SummaryResult> {
    try {
      if (!text || text.trim().length === 0) {
        return {
          summary: language === 'vi' ? 'Không có nội dung để tóm tắt.' : 'No content to summarize.',
          keyPoints: [],
          actionItems: [],
          decisions: [],
          topics: [],
          source: 'openai',
          generatedAt: new Date().toISOString()
        };
      }

      console.log(`[OpenAIService] Generating summary for ${text.length} characters in ${language}`);

      const prompt = this.buildSummarizationPrompt(text, context, language);
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(language)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      });

      const result = response.choices[0]?.message?.content;
      if (!result) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse the JSON response
      const parsedResult = JSON.parse(result);
      
      console.log(`[OpenAIService] Summary generated successfully with ${parsedResult.keyPoints?.length || 0} key points`);

      return {
        summary: parsedResult.summary || '',
        keyPoints: parsedResult.keyPoints || [],
        actionItems: parsedResult.actionItems || [],
        decisions: parsedResult.decisions || [],
        topics: parsedResult.topics || [],
        source: 'openai',
        confidence: 0.9, // OpenAI generally provides high-quality summaries
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('[OpenAIService] Summarization failed:', error);
      throw new Error(`OpenAI summarization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate participant-specific summary
   * @param text Participant's speech transcript
   * @param participantName Name of the participant
   * @param language Language for the summary
   * @returns Participant summary
   */
  async summarizeParticipantContribution(
    text: string,
    participantName: string,
    language: string = 'vi'
  ): Promise<SummaryResult> {
    try {
      if (!text || text.trim().length === 0) {
        return {
          summary: language === 'vi' 
            ? `${participantName} không có phát biểu trong cuộc họp này.`
            : `${participantName} did not speak in this meeting.`,
          keyPoints: [],
          actionItems: [],
          decisions: [],
          topics: [],
          source: 'openai',
          generatedAt: new Date().toISOString()
        };
      }

      console.log(`[OpenAIService] Generating participant summary for ${participantName} (${text.length} characters)`);

      const prompt = this.buildParticipantPrompt(text, participantName, language);
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getParticipantSystemPrompt(language)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      });

      const result = response.choices[0]?.message?.content;
      if (!result) {
        throw new Error('Empty response from OpenAI');
      }

      const parsedResult = JSON.parse(result);
      
      return {
        summary: parsedResult.summary || '',
        keyPoints: parsedResult.keyPoints || [],
        actionItems: parsedResult.actionItems || [],
        decisions: parsedResult.decisions || [],
        topics: parsedResult.topics || [],
        source: 'openai',
        confidence: 0.9,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[OpenAIService] Participant summarization failed for ${participantName}:`, error);
      throw new Error(`OpenAI participant summarization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getSystemPrompt(language: string): string {
    if (language === 'vi') {
      return `Bạn là một AI chuyên gia tóm tắt cuộc họp. Nhiệm vụ của bạn là phân tích transcript cuộc họp và tạo ra một bản tóm tắt toàn diện, có cấu trúc.

Hãy trả về kết quả dưới dạng JSON với cấu trúc sau:
{
  "summary": "Tóm tắt tổng quan của cuộc họp (2-3 đoạn)",
  "keyPoints": ["Điểm chính 1", "Điểm chính 2", "..."],
  "actionItems": ["Nhiệm vụ cần thực hiện 1", "Nhiệm vụ cần thực hiện 2", "..."],
  "decisions": ["Quyết định 1", "Quyết định 2", "..."],
  "topics": ["Chủ đề 1", "Chủ đề 2", "..."]
}

Hãy tập trung vào:
- Mục đích và nội dung chính của cuộc họp
- Các quyết định quan trọng được đưa ra
- Nhiệm vụ và hành động cần thực hiện
- Các vấn đề được thảo luận
- Timeline và deadline nếu có`;
    } else {
      return `You are an expert meeting summarization AI. Your task is to analyze meeting transcripts and create comprehensive, structured summaries.

Return the result as JSON with this structure:
{
  "summary": "Overall meeting summary (2-3 paragraphs)",
  "keyPoints": ["Key point 1", "Key point 2", "..."],
  "actionItems": ["Action item 1", "Action item 2", "..."],
  "decisions": ["Decision 1", "Decision 2", "..."],
  "topics": ["Topic 1", "Topic 2", "..."]
}

Focus on:
- Meeting purpose and main content
- Important decisions made
- Tasks and actions to be taken
- Issues discussed
- Timelines and deadlines if mentioned`;
    }
  }

  private getParticipantSystemPrompt(language: string): string {
    if (language === 'vi') {
      return `Bạn là một AI chuyên gia phân tích đóng góp của từng thành viên trong cuộc họp. Nhiệm vụ của bạn là tóm tắt những gì một người cụ thể đã nói và đóng góp.

Trả về kết quả dưới dạng JSON:
{
  "summary": "Tóm tắt đóng góp của thành viên này",
  "keyPoints": ["Điểm chính người này đề cập"],
  "actionItems": ["Nhiệm vụ được giao cho người này"],
  "decisions": ["Quyết định mà người này đưa ra hoặc ủng hộ"],
  "topics": ["Chủ đề mà người này thảo luận"]
}`;
    } else {
      return `You are an expert AI for analyzing individual participant contributions in meetings. Your task is to summarize what a specific person said and contributed.

Return the result as JSON:
{
  "summary": "Summary of this participant's contributions",
  "keyPoints": ["Key points this person mentioned"],
  "actionItems": ["Tasks assigned to this person"],
  "decisions": ["Decisions this person made or supported"],
  "topics": ["Topics this person discussed"]
}`;
    }
  }

  private buildSummarizationPrompt(text: string, context?: string, language: string = 'vi'): string {
    const contextText = context ? `Context: ${context}\n\n` : '';
    
    if (language === 'vi') {
      return `${contextText}Hãy phân tích và tóm tắt transcript cuộc họp sau đây:

${text}

Hãy tạo một bản tóm tắt toàn diện bao gồm tất cả các thông tin quan trọng từ cuộc họp.`;
    } else {
      return `${contextText}Please analyze and summarize the following meeting transcript:

${text}

Create a comprehensive summary including all important information from the meeting.`;
    }
  }

  private buildParticipantPrompt(text: string, participantName: string, language: string = 'vi'): string {
    if (language === 'vi') {
      return `Hãy tóm tắt đóng góp của ${participantName} trong cuộc họp dựa trên transcript sau:

${text}

Tập trung vào những gì ${participantName} đã nói, ý kiến và đóng góp của họ.`;
    } else {
      return `Please summarize ${participantName}'s contributions to the meeting based on the following transcript:

${text}

Focus on what ${participantName} said, their opinions, and contributions.`;
    }
  }
}

export default OpenAIService;

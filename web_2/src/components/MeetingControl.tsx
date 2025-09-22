'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Play, 
  Clock, 
  Users, 
  FileText, 
  BarChart3,
  Bot,
  Zap,
  Activity,
  Mic,
  Video,
  Brain
} from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { sessionApi } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface SessionListItem {
  id: string;
  type: "live" | "completed";
  meetingUrl?: string | null;
  startedAt?: string | null;
  archivedAt?: string | null;
}

interface SessionDetailsResponse {
  sessionId: string;
  durationMs: number;
  idleMsBeforeClose?: number;
  stats?: {
    jsonMessages: number;
    mixedAudioFrames: number;
    participantAudioFrames: number;
    videoFrames: number;
    encodedVideoChunks: number;
    unknownFrames: number;
  };
  metadata?: {
    sessionId: string;
    port: number;
    recordingsRoot: string;
    remoteAddress: string;
    userAgent: string;
    startedAtIso: string;
    audioFormat: string;
    meetingUrl: string;
    botName: string;
    audioFiles: string;
    participants: Array<{
      deviceId: string;
      displayName: string;
      fullName: string;
      isCurrentUser: boolean;
    }>;
    archivePath: string;
    manifestPath: string;
  };
  overallSummary?: {
    summary: string;
    keyPoints: string[];
  } | null;
  overallTranscript?: {
    text: string;
    confidence: number;
    duration: number;
    language: string;
  } | null;
  participantDetails?: Array<{
    id: string;
    audioFiles: Array<{
      filename: string;
      path: string;
    }>;
    transcripts: Array<{
      filename: string;
      data: {
        text: string;
        confidence: number;
        duration: number;
        language: string;
      };
    }>;
    summaries: Array<{
      filename: string;
      data: {
        summary: string;
        keyPoints: string[];
      };
    }>;
  }>;
  audioFiles?: {
    mixedAudio: string;
  };
}

function StartCard({ onStarted }: { onStarted?: () => void }) {
  const [meetingUrl, setMeetingUrl] = useState('');
  const [botName, setBotName] = useState('MeetBot AI');
  const [duration, setDuration] = useState('1800');
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = async () => {
    if (!meetingUrl.trim()) {
      toast.error('Vui lòng nhập URL cuộc họp');
      return;
    }

    setIsLoading(true);
    try {
      await sessionApi.startRecording(meetingUrl.trim(), botName.trim() || 'MeetBot AI', parseInt(duration) || 1800);
      
      toast.success('Đã bắt đầu ghi âm cuộc họp!');
      setMeetingUrl('');
      if (onStarted) onStarted();
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast.error('Không thể bắt đầu ghi âm. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl mb-6">
        <CardHeader className="pb-4">
          <motion.div 
            className="flex items-center gap-3 mb-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="w-12 h-12 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
                Bắt đầu ghi âm
              </CardTitle>
              <CardDescription className="text-white/70">
                Khởi tạo bot ghi âm cho cuộc họp Google Meet
              </CardDescription>
            </div>
          </motion.div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <motion.div 
            className="space-y-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Label htmlFor="meetingUrl" className="text-white/90 font-medium flex items-center gap-2">
              <Video className="w-4 h-4" />
              URL cuộc họp Google Meet
            </Label>
            <Input
              id="meetingUrl"
              type="url"
              placeholder="https://meet.google.com/abc-defg-hij"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-cyan-400 focus:ring-cyan-400/20"
              disabled={isLoading}
            />
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div 
              className="space-y-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Label htmlFor="botName" className="text-white/90 font-medium flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Tên bot
              </Label>
              <Input
                id="botName"
                placeholder="MeetBot AI"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-cyan-400 focus:ring-cyan-400/20"
                disabled={isLoading}
              />
            </motion.div>

            <motion.div 
              className="space-y-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <Label htmlFor="duration" className="text-white/90 font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Thời gian (giây)
              </Label>
              <Input
                id="duration"
                type="number"
                placeholder="1800"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-cyan-400 focus:ring-cyan-400/20"
                disabled={isLoading}
              />
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <Button 
              onClick={handleStart} 
              disabled={isLoading || !meetingUrl.trim()}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner size="sm" />
                  <span>Đang khởi tạo...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Play className="w-5 h-5" />
                  <span>Bắt đầu ghi âm</span>
                </div>
              )}
            </Button>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SessionsList({
  live,
  completed,
  onSelect,
  selectedId,
  onRefresh
}: {
  live: SessionListItem[];
  completed: SessionListItem[];
  onSelect: (id: string | null) => void;
  selectedId: string | null;
  onRefresh: () => void;
}) {

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const SessionCard = ({ session, isLive }: { session: SessionListItem; isLive: boolean }) => (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
      className="cursor-pointer"
      onClick={() => onSelect(selectedId === session.id ? null : session.id)}
    >
      <Card className={`bg-gradient-to-br backdrop-blur-xl border shadow-lg transition-all duration-300 ${
        selectedId === session.id 
          ? 'from-cyan-500/20 to-blue-500/20 border-cyan-400/50 shadow-cyan-500/25' 
          : 'from-white/10 to-white/5 border-white/20 hover:from-white/15 hover:to-white/10'
      }`}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <motion.div 
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isLive 
                    ? 'bg-gradient-to-r from-green-400 to-emerald-500' 
                    : 'bg-gradient-to-r from-gray-400 to-gray-500'
                }`}
                animate={isLive ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {isLive ? <Activity className="w-5 h-5 text-white" /> : <Clock className="w-5 h-5 text-white" />}
              </motion.div>
              <div>
                <h3 className="font-semibold text-white text-lg">
                  {session.meetingUrl?.split('/').pop()?.substring(0, 12) || session.id}
                </h3>
                <p className="text-white/70 text-sm">
                  {session.startedAt ? formatDate(session.startedAt) : 'N/A'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge 
                variant={isLive ? "default" : "secondary"}
                className={`${
                  isLive 
                    ? 'bg-green-500/20 text-green-300 border-green-400/30' 
                    : 'bg-gray-500/20 text-gray-300 border-gray-400/30'
                } backdrop-blur-sm`}
              >
                {isLive ? (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    Đang ghi
                  </div>
                ) : (
                  'Hoàn thành'
                )}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-white/80">
              <Clock className="w-4 h-4" />
              <span>N/A</span>
            </div>
            <div className="flex items-center gap-2 text-white/80">
              <Users className="w-4 h-4" />
              <span>0 người</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <motion.div 
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="w-12 h-12 bg-gradient-to-r from-purple-400 to-pink-500 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
                  Danh sách phiên họp
                </CardTitle>
                <CardDescription className="text-white/70">
                  Quản lý và theo dõi các cuộc họp
                </CardDescription>
              </div>
            </motion.div>
            
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                onClick={onRefresh}
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/30"
              >
                <Activity className="w-4 h-4 mr-2" />
                Làm mới
              </Button>
            </motion.div>
          </div>
        </CardHeader>
        
        <CardContent>
          <Tabs defaultValue="live" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-white/10 backdrop-blur-sm mb-6">
              <TabsTrigger 
                value="live" 
                className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300 text-white/70"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Đang ghi ({live.length})
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="completed" 
                className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300 text-white/70"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Hoàn thành ({completed.length})
                </div>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="live" className="space-y-4">
              <AnimatePresence>
                {live.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-12"
                  >
                    <div className="w-16 h-16 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Mic className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-white/70 text-lg">Không có phiên ghi âm nào đang hoạt động</p>
                    <p className="text-white/50 text-sm mt-2">Bắt đầu một cuộc họp mới để xem ở đây</p>
                  </motion.div>
                ) : (
                  live.map((session) => (
                    <SessionCard key={session.id} session={session} isLive={true} />
                  ))
                )}
              </AnimatePresence>
            </TabsContent>
            
            <TabsContent value="completed" className="space-y-4">
              <AnimatePresence>
                {completed.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-12"
                  >
                    <div className="w-16 h-16 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-white/70 text-lg">Chưa có cuộc họp nào hoàn thành</p>
                    <p className="text-white/50 text-sm mt-2">Các cuộc họp đã kết thúc sẽ xuất hiện ở đây</p>
                  </motion.div>
                ) : (
                  completed.map((session) => (
                    <SessionCard key={session.id} session={session} isLive={false} />
                  ))
                )}
              </AnimatePresence>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SessionDetails({ sessionId }: { sessionId: string | null }) {
  const [details, setDetails] = useState<SessionDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Helper function to get participant display name
  const getParticipantDisplayName = (participantId: string, metadata?: SessionDetailsResponse['metadata']) => {
    if (!metadata?.participants) return participantId;
    
    const participant = metadata.participants.find(p => 
      p.deviceId === participantId || 
      participantId.includes(p.displayName) ||
      participantId.includes(p.fullName)
    );
    
    return participant?.fullName || participant?.displayName || participantId;
  };

  useEffect(() => {
    if (!sessionId) {
      setDetails(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data: SessionDetailsResponse = await sessionApi.getSessionDetails(sessionId);
        if (!cancelled) {
          setDetails(data);
        }
      } catch (error) {
        if (!cancelled) {
          setDetails(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !details?.metadata?.archivePath) return;
    
    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      try {
        const data: SessionDetailsResponse = await sessionApi.getSessionDetails(sessionId);
        if (!cancelled) {
          setDetails(data);
        }
      } catch (error) {
        // ignore transient errors
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, details]);

  if (!sessionId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <Card className="mt-6 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl">
          <CardContent className="p-12 text-center">
            <motion.div
              className="w-20 h-20 bg-gradient-to-r from-indigo-400 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-6"
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            >
              <Brain className="w-10 h-10 text-white" />
            </motion.div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Chọn một phiên họp
            </h3>
            <p className="text-white/70">
              Chọn một phiên họp từ danh sách để xem chi tiết và tải xuống tệp
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (loading && !details) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <Card className="mt-6 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl">
          <CardContent className="p-12 text-center">
            <LoadingSpinner size="lg" text="Đang tải chi tiết phiên họp..." />
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (!details) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <Card className="mt-6 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-red-400 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Không tìm thấy dữ liệu
            </h3>
            <p className="text-white/70">
              Không thể tải thông tin chi tiết cho phiên họp này
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
    >
      <Card className="mt-6 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl">
        <CardHeader className="border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-white">Chi tiết phiên họp</CardTitle>
              <CardDescription className="text-white/70">
                {details.sessionId} • {details.metadata?.archivePath ? (
                  <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                    <Clock className="w-3 h-3 mr-1" />
                    Đã hoàn thành
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-green-500/20 text-green-300 border-green-500/30">
                    <Activity className="w-3 h-3 mr-1" />
                    Đang diễn ra
                  </Badge>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {/* Meeting Overview */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-semibold text-white">Tổng quan cuộc họp</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <Label className="text-sm font-medium text-white flex items-center gap-2">
                    <Mic className="w-4 h-4 text-indigo-400" />
                    Audio tổng hợp
                  </Label>
                  {details.audioFiles?.mixedAudio ? (
                    <audio 
                      controls 
                      src={`${API_BASE}/api/sessions/${encodeURIComponent(details.sessionId)}/files/${details.audioFiles.mixedAudio}`} 
                      className="w-full mt-2"
                    />
                  ) : (
                    <p className="text-white/50 text-sm mt-2">Chưa có audio tổng hợp</p>
                  )}
                </CardContent>
              </Card>
              
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <Label className="text-sm font-medium text-white flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" />
                    Tóm tắt cuộc họp
                  </Label>
                  {details.overallSummary ? (
                    <div className="mt-2">
                      <p className="text-white/90 text-sm mb-2">{details.overallSummary.summary}</p>
                      {details.overallSummary.keyPoints && details.overallSummary.keyPoints.length > 0 && (
                        <div>
                          <p className="text-white/70 text-xs mb-1">Điểm chính:</p>
                          <ul className="text-white/80 text-xs space-y-1">
                            {details.overallSummary.keyPoints.map((point, index) => (
                              <li key={index} className="flex items-start gap-1">
                                <span className="text-indigo-400">•</span>
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-white/50 text-sm mt-2">Chưa có tóm tắt cuộc họp</p>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {details.overallTranscript && (
              <Card className="mt-4 bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-400" />
                      Bản ghi âm tổng hợp
                    </Label>
                    <p className="text-white/90 text-sm">{details.overallTranscript.text}</p>
                    <div className="flex gap-4 text-xs text-white/60">
                      <span>Độ tin cậy: {Math.round(details.overallTranscript.confidence * 100)}%</span>
                      <span>Thời lượng: {Math.round(details.overallTranscript.duration)}s</span>
                      <span>Ngôn ngữ: {details.overallTranscript.language}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Participants */}
          {details.participantDetails && details.participantDetails.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-green-400" />
                <h3 className="text-lg font-semibold text-white">
                  Người tham gia ({details.participantDetails.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {details.participantDetails.map((participant) => (
                  <Card key={participant.id} className="bg-white/5 border-white/10">
                    <CardHeader className="pb-3 border-b border-white/10">
                      <CardTitle className="text-base text-white flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-blue-500 rounded-full flex items-center justify-center">
                          <Users className="w-4 h-4 text-white" />
                        </div>
                        {getParticipantDisplayName(participant.id, details.metadata)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4">
                      {/* Audio Files */}
                      {participant.audioFiles && participant.audioFiles.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium text-white flex items-center gap-2">
                            <Mic className="w-4 h-4 text-indigo-400" />
                            Audio
                          </Label>
                          <div className="space-y-2 mt-2">
                            {participant.audioFiles.map((audioFile, index) => (
                              <div key={index}>
                                <audio 
                                  controls 
                                  src={`${API_BASE}/api/sessions/${encodeURIComponent(details.sessionId)}/files/${audioFile.filename}`} 
                                  className="w-full"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Transcripts */}
                      {participant.transcripts && participant.transcripts.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium text-white flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-400" />
                            Bản ghi âm
                          </Label>
                          <div className="space-y-2 mt-2">
                            {participant.transcripts.map((transcript, index) => (
                              <div key={index} className="bg-white/5 rounded p-2">
                                <p className="text-white/90 text-sm mb-1">{transcript.data.text}</p>
                                <div className="flex gap-4 text-xs text-white/60">
                                  <span>Độ tin cậy: {Math.round(transcript.data.confidence * 100)}%</span>
                                  <span>Thời lượng: {Math.round(transcript.data.duration)}s</span>
                                  <span>Ngôn ngữ: {transcript.data.language}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Summaries */}
                      {participant.summaries && participant.summaries.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium text-white flex items-center gap-2">
                            <Brain className="w-4 h-4 text-purple-400" />
                            Tóm tắt
                          </Label>
                          <div className="space-y-2 mt-2">
                            {participant.summaries.map((summary, index) => (
                              <div key={index} className="bg-white/5 rounded p-2">
                                <p className="text-white/90 text-sm mb-2">{summary.data.summary}</p>
                                {summary.data.keyPoints && summary.data.keyPoints.length > 0 && (
                                  <div>
                                    <p className="text-white/70 text-xs mb-1">Điểm chính:</p>
                                    <ul className="text-white/80 text-xs space-y-1">
                                      {summary.data.keyPoints.map((point, pointIndex) => (
                                        <li key={pointIndex} className="flex items-start gap-1">
                                          <span className="text-indigo-400">•</span>
                                          <span>{point}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function MeetingControl() {
  const [live, setLive] = useState<SessionListItem[]>([]);
  const [completed, setCompleted] = useState<SessionListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [liveRes, completedRes] = await Promise.all([
        sessionApi.getLiveSessions().catch((error) => {
          console.error("Failed to load live sessions", error);
          return ({ items: [] });
        }),
        sessionApi.getCompletedSessions().catch((error) => {
          console.error("Failed to load completed sessions", error);
          return ({ items: [] });
        })
      ]);
      setLive(liveRes.items ?? []);
      setCompleted(completedRes.items ?? []);
    } catch (error) {
      console.error("Failed to refresh sessions", error);
      toast.error("Không thể tải danh sách phiên họp");
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <motion.div 
      className="space-y-6 p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <motion.div 
        className="text-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="w-16 h-16 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4"
          whileHover={{ scale: 1.05, rotate: 5 }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
        >
          <Bot className="w-8 h-8 text-white" />
        </motion.div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent mb-2">
          MeetBot AI Dashboard
        </h1>
        <p className="text-white/70 text-lg">
          Quản lý và điều khiển các phiên ghi âm cuộc họp
        </p>
        <motion.div 
          className="flex items-center justify-center gap-2 mt-4 text-sm text-white/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <Zap className="w-4 h-4 text-yellow-400" />
          <span>Powered by AI Technology</span>
        </motion.div>
      </motion.div>

      <StartCard onStarted={refresh} />
      <SessionsList
        live={live}
        completed={completed}
        onSelect={setSelectedId}
        selectedId={selectedId}
        onRefresh={refresh}
      />
      <SessionDetails sessionId={selectedId} />
    </motion.div>
  );
}
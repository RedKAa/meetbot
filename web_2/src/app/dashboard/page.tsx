'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { CalendarDays, Clock, Users, Mic } from 'lucide-react';
import { toast } from 'sonner';
import { sessionApi } from '@/lib/api';
import { motion } from "framer-motion";
import { BackgroundGradientAnimation } from '@/components/BackgroundGradientAnimation';

interface SessionListItem {
  id: string;
  type: "live" | "completed";
  meetingUrl?: string | null;
  startedAt?: string | null;
  archivedAt?: string | null;
}

interface DashboardStats {
  totalMeetings: number;
  totalDuration: number;
  averageDuration: number;
  activeMeetings: number;
  weeklyData: Array<{
    day: string;
    meetings: number;
    duration: number;
  }>;
  monthlyData: Array<{
    month: string;
    meetings: number;
  }>;
  statusData: Array<{
    name: string;
    value: number;
    color: string;
  }>;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function StatCard({ title, value, description, icon: Icon, color = "default" }: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color?: "default" | "blue" | "green" | "orange";
}) {
  const colorClasses = {
    blue: "text-blue-400",
    green: "text-green-400", 
    orange: "text-orange-400",
    default: "text-cyan-400"
  };

  return (
    <Card className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-white/70">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-white/60">{description}</p>
          </div>
          <div className={`p-3 rounded-full bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm ${colorClasses[color]}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadStats = async () => {
      try {
        setLoadingStats(true);
        
        // Fetch sessions data
        const [liveRes, completedRes] = await Promise.all([
          sessionApi.getLiveSessions().catch(() => ({ items: [] })),
          sessionApi.getCompletedSessions().catch(() => ({ items: [] }))
        ]);

        const liveSessions = (liveRes.items ?? []) as SessionListItem[];
        const completedSessions = (completedRes.items ?? []) as SessionListItem[];
        const allSessions = [...liveSessions, ...completedSessions] as SessionListItem[];

        // Calculate stats
        const totalMeetings = allSessions.length;
        const activeMeetings = liveSessions.length;
        
        // Mock duration calculation (in real app, you'd get this from session details)
        const totalDuration = completedSessions.length * 1800; // 30 minutes average
        const averageDuration = completedSessions.length > 0 ? totalDuration / completedSessions.length : 0;

        // Generate weekly data (last 7 days)
        const weeklyData = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const dayName = date.toLocaleDateString('vi-VN', { weekday: 'short' });
          
          // Count meetings for this day
          const dayMeetings = allSessions.filter((session: SessionListItem) => {
            if (!session.startedAt) return false;
            const sessionDate = new Date(session.startedAt);
            return sessionDate.toDateString() === date.toDateString();
          }).length;

          weeklyData.push({
            day: dayName,
            meetings: dayMeetings,
            duration: dayMeetings * 30 // Mock 30 minutes per meeting
          });
        }

        // Generate monthly data (last 6 months)
        const monthlyData = [];
        for (let i = 5; i >= 0; i--) {
          const date = new Date(today);
          date.setMonth(date.getMonth() - i);
          const monthName = date.toLocaleDateString('vi-VN', { month: 'short' });
          
          const monthMeetings = allSessions.filter((session: SessionListItem) => {
            if (!session.startedAt) return false;
            const sessionDate = new Date(session.startedAt);
            return sessionDate.getMonth() === date.getMonth() && 
                   sessionDate.getFullYear() === date.getFullYear();
          }).length;

          monthlyData.push({
            month: monthName,
            meetings: monthMeetings
          });
        }

        // Status data for pie chart
        const statusData = [
          {
            name: 'Đã hoàn thành',
            value: completedSessions.length,
            color: '#22c55e'
          },
          {
            name: 'Đang diễn ra',
            value: liveSessions.length,
            color: '#3b82f6'
          }
        ];

        setStats({
          totalMeetings,
          totalDuration,
          averageDuration,
          activeMeetings,
          weeklyData,
          monthlyData,
          statusData
        });
      } catch (error) {
        console.error('Failed to load dashboard stats:', error);
        toast.error('Không thể tải thống kê dashboard');
      } finally {
        setLoadingStats(false);
      }
    };

    loadStats();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [user]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Đang tải...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-muted-foreground">Vui lòng đăng nhập để xem dashboard</p>
              <Button className="mt-4" onClick={() => window.location.href = '/'}>
                Đăng nhập
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <BackgroundGradientAnimation />
      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            className="mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">Dashboard</h1>
            <p className="text-white/70 mt-2">
              Tổng quan thống kê các cuộc họp của bạn
            </p>
          </motion.div>

          {loadingStats ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
            </div>
          ) : stats ? (
            <motion.div 
              className="space-y-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Tổng số cuộc họp"
                  value={stats.totalMeetings}
                  description="Tất cả cuộc họp đã ghi"
                  icon={CalendarDays}
                  color="blue"
                />
                <StatCard
                  title="Tổng thời gian"
                  value={formatDuration(stats.totalDuration)}
                  description="Thời gian ghi âm tổng cộng"
                  icon={Clock}
                  color="green"
                />
                <StatCard
                  title="Thời gian trung bình"
                  value={formatDuration(stats.averageDuration)}
                  description="Thời gian trung bình mỗi cuộc họp"
                  icon={Users}
                  color="orange"
                />
                <StatCard
                  title="Đang hoạt động"
                  value={stats.activeMeetings}
                  description="Cuộc họp đang diễn ra"
                  icon={Mic}
                  color="default"
                />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Weekly Meetings Chart */}
                <Card className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl">
                  <CardHeader>
                    <CardTitle className="text-white">Cuộc họp trong tuần</CardTitle>
                    <CardDescription className="text-white/70">Số lượng cuộc họp 7 ngày qua</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={stats.weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis 
                          dataKey="day" 
                          tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                        />
                        <YAxis 
                          tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                        />
                        <Tooltip 
                          formatter={(value, name) => [
                            name === 'meetings' ? `${value} cuộc họp` : `${value} phút`,
                            name === 'meetings' ? 'Số cuộc họp' : 'Thời gian'
                          ]}
                          contentStyle={{
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            backdropFilter: 'blur(10px)'
                          }}
                        />
                        <Bar dataKey="meetings" fill="#06b6d4" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Monthly Trend */}
                <Card className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl">
                  <CardHeader>
                    <CardTitle className="text-white">Xu hướng theo tháng</CardTitle>
                    <CardDescription className="text-white/70">Số lượng cuộc họp 6 tháng qua</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={stats.monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis 
                          dataKey="month" 
                          tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                        />
                        <YAxis 
                          tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                        />
                        <Tooltip 
                          formatter={(value) => [`${value} cuộc họp`, 'Số cuộc họp']}
                          contentStyle={{
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            backdropFilter: 'blur(10px)'
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="meetings" 
                          stroke="#22c55e" 
                          strokeWidth={2}
                          dot={{ fill: '#22c55e' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Status Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-1 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl">
                  <CardHeader>
                    <CardTitle className="text-white">Trạng thái cuộc họp</CardTitle>
                    <CardDescription className="text-white/70">Phân bố theo trạng thái</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={stats.statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {stats.statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value) => [`${value} cuộc họp`, 'Số lượng']}
                          contentStyle={{
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            backdropFilter: 'blur(10px)'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-4 space-y-2">
                      {stats.statusData.map((item, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-sm text-white">{item.name}</span>
                          </div>
                          <Badge variant="secondary" className="bg-white/10 backdrop-blur-sm border-white/20 text-white">{item.value}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl">
                  <CardHeader>
                    <CardTitle className="text-white">Thời gian ghi âm hàng tuần</CardTitle>
                    <CardDescription className="text-white/70">Tổng thời gian ghi âm theo ngày trong tuần</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={stats.weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis 
                          dataKey="day" 
                          tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                        />
                        <YAxis 
                          tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                        />
                        <Tooltip 
                          formatter={(value) => [`${value} phút`, 'Thời gian ghi âm']}
                          contentStyle={{
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            backdropFilter: 'blur(10px)'
                          }}
                        />
                        <Bar dataKey="duration" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          ) : (
            <Card className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl">
              <CardContent className="pt-6">
                <p className="text-center text-white/70">
                  Không thể tải dữ liệu thống kê
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
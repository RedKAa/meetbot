"use client";

import { motion } from "framer-motion";
import { BackgroundGradientAnimation } from "./BackgroundGradientAnimation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Bot, 
  Video, 
  Brain, 
  Zap, 
  Shield, 
  Users, 
  ArrowRight,
  Play,
  Mic,
  FileText,
  BarChart3
} from "lucide-react";

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  const features = [
    {
      icon: <Video className="w-8 h-8" />,
      title: "Ghi âm thông minh",
      description: "Tự động ghi âm và phân tích cuộc họp Google Meet với AI"
    },
    {
      icon: <Brain className="w-8 h-8" />,
      title: "Phân tích AI",
      description: "Trích xuất thông tin quan trọng và tạo tóm tắt tự động"
    },
    {
      icon: <FileText className="w-8 h-8" />,
      title: "Tóm tắt cuộc họp",
      description: "Tạo báo cáo chi tiết với các điểm chính và hành động"
    },
    {
      icon: <BarChart3 className="w-8 h-8" />,
      title: "Thống kê chi tiết",
      description: "Theo dõi hiệu suất và xu hướng cuộc họp"
    }
  ];

  const stats = [
    { number: "10K+", label: "Cuộc họp đã ghi" },
    { number: "95%", label: "Độ chính xác" },
    { number: "50+", label: "Ngôn ngữ hỗ trợ" },
    { number: "24/7", label: "Hỗ trợ" }
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      <BackgroundGradientAnimation />
      
      {/* Header */}
      <motion.header 
        className="relative z-10 p-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <motion.div
              className="w-10 h-10 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <Bot className="w-6 h-6 text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
              MeetBot AI
            </h1>
          </div>
          
          <Button 
            onClick={onGetStarted}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-6 py-2 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl"
          >
            Đăng nhập
          </Button>
        </div>
      </motion.header>

      {/* Hero Section */}
      <motion.section 
        className="relative z-10 px-6 py-20"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            className="inline-flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-8"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-white/90">Powered by AI Technology</span>
          </motion.div>

          <motion.h2 
            className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white via-cyan-200 to-blue-300 bg-clip-text text-transparent leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            Cuộc họp thông minh
            <br />
            <span className="text-cyan-400">với AI</span>
          </motion.h2>

          <motion.p 
            className="text-xl text-white/80 mb-12 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            Tự động ghi âm, phân tích và tóm tắt cuộc họp Google Meet của bạn. 
            Tiết kiệm thời gian và không bỏ lỡ thông tin quan trọng nào.
          </motion.p>

          <motion.div 
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1 }}
          >
            <Button 
              onClick={onGetStarted}
              size="lg"
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-8 py-4 rounded-full text-lg font-semibold shadow-2xl hover:shadow-cyan-500/25 transition-all duration-300 group"
            >
              Bắt đầu ngay
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            
            <Button 
              variant="outline"
              size="lg"
              className="border-white/30 text-white hover:bg-white/10 px-8 py-4 rounded-full text-lg backdrop-blur-sm"
            >
              <Play className="w-5 h-5 mr-2" />
              Xem demo
            </Button>
          </motion.div>
        </div>
      </motion.section>

      {/* Stats Section */}
      <motion.section 
        className="relative z-10 px-6 py-16"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1.2 }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.4 + index * 0.1 }}
              >
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
                  {stat.number}
                </div>
                <div className="text-white/70 text-sm">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Features Section */}
      <motion.section 
        className="relative z-10 px-6 py-20"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1.6 }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Tính năng nổi bật
            </h3>
            <p className="text-white/70 text-lg max-w-2xl mx-auto">
              Khám phá các tính năng AI tiên tiến giúp tối ưu hóa cuộc họp của bạn
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.8 + index * 0.1 }}
                whileHover={{ y: -5 }}
              >
                <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-all duration-300 h-full">
                  <CardContent className="p-6 text-center">
                    <motion.div 
                      className="w-16 h-16 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                      <div className="text-white">
                        {feature.icon}
                      </div>
                    </motion.div>
                    <h4 className="text-xl font-semibold text-white mb-3">
                      {feature.title}
                    </h4>
                    <p className="text-white/70 leading-relaxed">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* CTA Section */}
      <motion.section 
        className="relative z-10 px-6 py-20"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 2.2 }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <Card className="bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-sm border-white/20">
            <CardContent className="p-12">
              <motion.div
                className="w-20 h-20 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6"
                whileHover={{ scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Users className="w-10 h-10 text-white" />
              </motion.div>
              
              <h3 className="text-3xl font-bold text-white mb-4">
                Sẵn sàng nâng cao cuộc họp?
              </h3>
              
              <p className="text-white/70 text-lg mb-8 max-w-2xl mx-auto">
                Tham gia cùng hàng nghìn người dùng đã tin tưởng MeetBot AI 
                để tối ưu hóa cuộc họp của họ.
              </p>
              
              <Button 
                onClick={onGetStarted}
                size="lg"
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-12 py-4 rounded-full text-lg font-semibold shadow-2xl hover:shadow-cyan-500/25 transition-all duration-300 group"
              >
                Bắt đầu miễn phí
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </motion.section>

      {/* Footer */}
      <motion.footer 
        className="relative z-10 px-6 py-8 border-t border-white/10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 2.6 }}
      >
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-white/50 text-sm">
            © 2024 MeetBot AI. Tất cả quyền được bảo lưu.
          </p>
        </div>
      </motion.footer>
    </div>
  );
}
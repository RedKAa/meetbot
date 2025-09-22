"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { LandingPage } from "@/components/LandingPage";
import { LoadingSpinner, FullScreenLoader } from "@/components/LoadingSpinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackgroundGradientAnimation } from "@/components/BackgroundGradientAnimation";
import { MeetingControl } from "@/components/MeetingControl";
import { Bot, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function Home() {
  const { user, login, register } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });
  
  const [registerData, setRegisterData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    // Simulate initial loading
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    
    try {
      await login(loginData.email, loginData.password);
      toast.success("Đăng nhập thành công!");
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (registerData.password !== registerData.confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp!");
      return;
    }
    
    setAuthLoading(true);
    
    try {
      await register(registerData.email, registerData.password);
      toast.success("Đăng ký thành công!");
    } catch (error) {
      console.error("Registration error:", error);
      toast.error("Đăng ký thất bại. Email có thể đã được sử dụng.");
    } finally {
      setAuthLoading(false);
    }
  };

  if (isLoading) {
    return <FullScreenLoader text="Khởi tạo MeetBot AI..." />;
  }

  if (!user && !showAuth) {
    return <LandingPage onGetStarted={() => setShowAuth(true)} />;
  }

  if (!user && showAuth) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <BackgroundGradientAnimation />
        
        <div className="relative z-10 flex items-center justify-center min-h-screen p-6">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <Card className="bg-white/10 backdrop-blur-xl border-white/20 shadow-2xl">
              <CardHeader className="text-center pb-2">
                <motion.div
                  className="w-16 h-16 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  <Bot className="w-8 h-8 text-white" />
                </motion.div>
                <CardTitle className="text-2xl font-bold bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
                  MeetBot AI
                </CardTitle>
                <p className="text-white/70 text-sm mt-2">
                  Trải nghiệm cuộc họp thông minh với AI
                </p>
              </CardHeader>
              
              <CardContent className="pt-2">
                <Tabs defaultValue="login" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 bg-white/10 backdrop-blur-sm">
                    <TabsTrigger 
                      value="login" 
                      className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-600 data-[state=active]:text-white"
                    >
                      Đăng nhập
                    </TabsTrigger>
                    <TabsTrigger 
                      value="register"
                      className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-600 data-[state=active]:text-white"
                    >
                      Đăng ký
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="login" className="mt-6">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-white/90 flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          Email
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="your@email.com"
                          value={loginData.email}
                          onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-cyan-400 focus:ring-cyan-400/20"
                          required
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-white/90 flex items-center gap-2">
                          <Lock className="w-4 h-4" />
                          Mật khẩu
                        </Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            value={loginData.password}
                            onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-cyan-400 focus:ring-cyan-400/20 pr-10"
                            required
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 text-white/50 hover:text-white hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                      
                      <Button
                        type="submit"
                        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold py-2.5 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                        disabled={authLoading}
                      >
                        {authLoading ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          "Đăng nhập"
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                  
                  <TabsContent value="register" className="mt-6">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="reg-email" className="text-white/90 flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          Email
                        </Label>
                        <Input
                          id="reg-email"
                          type="email"
                          placeholder="your@email.com"
                          value={registerData.email}
                          onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-cyan-400 focus:ring-cyan-400/20"
                          required
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="reg-password" className="text-white/90 flex items-center gap-2">
                          <Lock className="w-4 h-4" />
                          Mật khẩu
                        </Label>
                        <div className="relative">
                          <Input
                            id="reg-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            value={registerData.password}
                            onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-cyan-400 focus:ring-cyan-400/20 pr-10"
                            required
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 text-white/50 hover:text-white hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password" className="text-white/90 flex items-center gap-2">
                          <Lock className="w-4 h-4" />
                          Xác nhận mật khẩu
                        </Label>
                        <div className="relative">
                          <Input
                            id="confirm-password"
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="••••••••"
                            value={registerData.confirmPassword}
                            onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-cyan-400 focus:ring-cyan-400/20 pr-10"
                            required
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 text-white/50 hover:text-white hover:bg-transparent"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                      
                      <Button
                        type="submit"
                        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold py-2.5 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                        disabled={authLoading}
                      >
                        {authLoading ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          "Đăng ký"
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
                
                <div className="mt-6 text-center">
                  <Button
                    variant="ghost"
                    onClick={() => setShowAuth(false)}
                    className="text-white/70 hover:text-white hover:bg-white/10 text-sm"
                  >
                    ← Quay lại trang chủ
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen relative"
    >
      <BackgroundGradientAnimation />
      <div className="relative z-10 container mx-auto px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <MeetingControl />
        </motion.div>
      </div>
    </motion.div>
  );
}

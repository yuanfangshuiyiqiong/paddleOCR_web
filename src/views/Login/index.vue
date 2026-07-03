<template>
  <div class="login-page">
    <div class="login-left">
      <div class="login-left__content">
        <div class="logo-box">
          <img src="@/assets/logo.svg" alt="logo" class="logo-box__icon" />
        </div>
        <h1 class="login-left__title">AI OCR 智能识别平台</h1>
        <p class="login-left__subtitle">
          基于 PaddleOCR 与大语言模型的智能图像识别系统
        </p>
        <div class="login-left__decoration">
          <div class="login-left__decoration-line"></div>
          <div class="login-left__decoration-line"></div>
          <div class="login-left__decoration-line"></div>
        </div>
      </div>
    </div>

    <div class="login-right">
      <div class="login-card">
        <h2 class="login-card__title">欢迎登录</h2>
        <p class="login-card__desc">登录后即可使用 OCR 智能识别能力</p>

        <el-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="loginRules"
          class="login-form"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="username">
            <el-input
              v-model="loginForm.username"
              placeholder="请输入用户名"
              size="large"
              :prefix-icon="User"
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              :type="passwordVisible ? 'text' : 'password'"
              placeholder="请输入密码"
              size="large"
              :prefix-icon="Lock"
              @keyup.enter="handleLogin"
            >
              <template #suffix>
                <el-icon
                  class="password-toggle"
                  @click="passwordVisible = !passwordVisible"
                >
                  <component :is="passwordVisible ? View : Hide" />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <div class="login-options">
            <el-checkbox v-model="loginForm.rememberMe">记住我</el-checkbox>
          </div>

          <el-button
            type="primary"
            size="large"
            class="login-button"
            :loading="loading"
            @click="handleLogin"
          >
            登录
          </el-button>

          <div v-if="errorMessage" class="login-error">
            {{ errorMessage }}
          </div>
        </el-form>

        <div class="login-footer">
          © 2026 AI OCR Platform
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElNotification } from 'element-plus'
import { User, Lock, Hide, View } from '@element-plus/icons-vue'
import { loginApi } from '@/api/user'
import { mockLoginApi, asAxiosResponse } from '@/api/mock/auth'
import { localStorage as storage } from '@/utils/storage'
import { useUserStore } from '@/store'

const router = useRouter()
const userStore = useUserStore()

// TODO: temporary dev-only mock login; remove before production
// Enable with: VITE_APP_USE_MOCK_LOGIN=true
// Mock credentials: admin / admin123
const useMockLogin = import.meta.env.VITE_APP_USE_MOCK_LOGIN === 'true'

const loginFormRef = ref()
const passwordVisible = ref(false)
const loading = ref(false)
const errorMessage = ref('')

const loginForm = reactive({
  username: '',
  password: '',
  rememberMe: false,
})

const loginRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '长度在 2 到 20 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 32, message: '长度在 6 到 32 个字符', trigger: 'blur' },
  ],
}

const handleLogin = async () => {
  errorMessage.value = ''

  if (!loginFormRef.value) return

  await loginFormRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    loading.value = true
    try {
      const loginRequest = () =>
        useMockLogin
          ? mockLoginApi({
              username: loginForm.username.trim(),
              password: loginForm.password,
            }).then((payload) => asAxiosResponse(payload) as any)
          : loginApi({
              username: loginForm.username.trim(),
              password: loginForm.password,
            })

      const res = await loginRequest()

      const { token, userInfo } = res.data.data

      storage.set('access_token', token)
      storage.set('user_info', userInfo)

      userStore.setLoginStatus(true)
      userStore.setToken(token)
      userStore.setUserInfo(userInfo)

      ElNotification({
        title: '登录成功',
        message: '欢迎回来',
        type: 'success',
      })

      router.push('/home')
    } catch (error: any) {
      errorMessage.value = error.message || '登录失败，请稍后重试'
      ElMessage.error(error.message || '登录失败，请稍后重试')
    } finally {
      loading.value = false
    }
  })
}
</script>

<style lang="scss" scoped>
.login-page {
  display: flex;
  height: 100vh;
  width: 100vw;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
    'Noto Sans', sans-serif;
}

.login-left {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60%;
  min-width: 320px;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(59, 130, 246, 0.12) 0%, transparent 50%);
    pointer-events: none;
  }
}

.login-left__content {
  position: relative;
  z-index: 1;
  max-width: 520px;
  padding: 0 64px;
  color: #ffffff;
}

.logo-box {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;

  &__icon {
    width: 48px;
    height: 48px;
  }
}

.login-left__title {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 1px;
  line-height: 1.3;
}

.login-left__subtitle {
  margin: 16px 0 0;
  font-size: 16px;
  color: rgba(226, 232, 240, 0.78);
  line-height: 1.6;
}

.login-left__decoration {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 40px;

  .login-left__decoration-line {
    width: 48px;
    height: 3px;
    border-radius: 999px;
    background: linear-gradient(90deg, #6366f1, #3b82f6);
  }
}

.login-right {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 24px;
  background: #f5f7fa;
}

.login-card {
  width: 420px;
  max-width: 100%;
  padding: 40px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04);
}

.login-card__title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #111827;
}

.login-card__desc {
  margin: 8px 0 28px;
  font-size: 14px;
  color: #6b7280;
}

.login-form {
  .el-form-item {
    margin-bottom: 20px;
  }

  .el-input__wrapper {
    border-radius: 10px;
    box-shadow: 0 0 0 1px #e5e7eb inset;
    transition: box-shadow 120ms ease, border-color 120ms ease;

    &:hover {
      box-shadow: 0 0 0 1px #c7d2fe inset;
    }

    &.is-focus,
    &:focus-within {
      box-shadow: 0 0 0 1px #6366f1 inset;
    }
  }

  .password-toggle {
    cursor: pointer;
    color: #9ca3af;
    transition: color 120ms ease;

    &:hover {
      color: #4b5563;
    }
  }
}

.login-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.login-button {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  border: none;
  font-size: 15px;
  font-weight: 500;
  transition: opacity 120ms ease, transform 80ms ease;

  &:active {
    transform: translateY(0);
  }

  &:hover {
    opacity: 0.92;
  }
}

.login-error {
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 13px;
  line-height: 1.5;
}

.login-footer {
  margin-top: 28px;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
}

@media (max-width: 1024px) {
  .login-left {
    width: 100%;
    min-height: 260px;
  }

  .login-right {
    width: 100%;
  }
}
</style>

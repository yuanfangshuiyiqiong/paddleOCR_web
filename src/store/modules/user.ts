import { defineStore } from 'pinia'
import { localStorage } from '@/utils/storage'

export interface UserState {
  id: number
  uuid: string
  username: string
  nickname: string
  phone: string
  avatar: string
  deptId: number
  email: string
  isMultiLogin: boolean
  isStaff: boolean
  isSuperuser: boolean
  joinTime: string
  lastLoginTime: string
  loginStatus: boolean
  token: string
}

const USER_STORAGE_KEY = 'user_info'
const TOKEN_STORAGE_KEY = 'access_token'

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    id: 0,
    uuid: '',
    username: '',
    nickname: '',
    phone: '',
    avatar: '',
    deptId: 0,
    email: '',
    isMultiLogin: false,
    isStaff: false,
    isSuperuser: false,
    joinTime: '',
    lastLoginTime: '',
    loginStatus: false,
    token: ''
  }),

  getters: {
  },

  actions: {
    setLoginStatus(status: boolean) {
      this.loginStatus = status
    },

    setToken(token: string) {
      this.token = token
    },

    setUserInfo(info: Partial<UserState>) {
      this.$patch(info)
    },

    logout() {
      this.$reset()
      localStorage.remove(TOKEN_STORAGE_KEY)
      localStorage.remove(USER_STORAGE_KEY)
    }
  }
})
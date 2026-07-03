export interface LoginParams {
  username: string
  password: string
}

export interface LoginUserInfo {
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
}

export interface LoginResult {
  code: number
  data: {
    token: string
    userInfo: LoginUserInfo
  }
  msg: string
}

import { AxiosPromise } from 'axios'
import request from '@/utils/request'
import { LoginResult, LoginParams } from './types'

export const loginApi = (params: LoginParams): AxiosPromise<LoginResult> => {
  return request({
    url: '/api/login',
    method: 'post',
    data: params,
  })
}

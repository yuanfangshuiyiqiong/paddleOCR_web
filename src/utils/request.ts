import axios, { AxiosResponse } from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import { setItem, getItem, removeItem } from '@/utils/storage';
import { useUserStore } from '@/store';
import { storeToRefs } from 'pinia';

// 创建 axios 实例
const service = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  timeout: 500000,
  headers: { 'Content-Type': 'application/json;charset=utf-8' },
});

// 请求拦截器
service.interceptors.request.use(
  (config: any) => {
    if (!config.headers) {
      throw new Error(
        `Expected 'config' and 'config.headers' not to be undefined`
      );
    }
    const { loginStatus } = storeToRefs(useUserStore())
    if (loginStatus && getItem('access_token')) {
      config.headers.Authorization = `Bearer ${getItem('access_token')}`;
    }
    return config;
  },
  (error: any) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
service.interceptors.response.use(
  (response: AxiosResponse) => {
    const data = response.data
    // OCR 后端返回 success 字段，常规接口返回 code 字段
    const isSuccess = data?.success === true || data?.code === 200
    if (isSuccess) {
      return response
    }
    // 响应数据为二进制流处理(Excel导出)
    if (data instanceof ArrayBuffer || data instanceof Array) {
      return response
    }

    const { msg } = data ?? {}
    if (data?.code === 401 || data?.detail === 'Signature has expired.') {
      removeItem('access_token')
      window.location.href = '/login'
      return Promise.reject(new Error(msg || '未授权，请重新登录'))
    }

    ElMessage({ message: data?.detail || msg || '系统出错', type: 'error' })
    return Promise.reject(new Error(msg || 'Error'))
  },
  (error: any) => {
    // 断网或者请求超时
    if (!error.response) {
      ElMessage({ message: '网络连接失败，请检查网络', type: 'error' })
      return Promise.reject(error)
    }

    const data = error.response.data
    if (data) {
      console.log('请求错误:', data)
      if (error.response.status === 401 || data?.detail === 'Signature has expired.') {
        removeItem('access_token')
        window.location.href = '/login'
      } else {
        ElMessage({ message: data?.detail || data?.msg || '系统出错', type: 'error' })
      }
    }
    return Promise.reject(error.message || error)
  }
);

// 导出 axios 实例
export default service;

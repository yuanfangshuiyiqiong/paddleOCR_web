import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import { useUserStore } from '@/store';
import { setItem, getItem, removeItem, clear } from '@/utils/storage';

type RouteRecordRaw = typeof RouteRecordRaw

// 不需要登录的白名单路由
const whiteList = ['/login', '/401', '/404', '/oauth/callback/github']
// 静态路由
export const constantRoutes: RouteRecordRaw[] = [
  {
    path: "/login",
    component: () => import("@/views/Login/index.vue"),
    meta: { 
      hidden: true,
      title: '登录 - AI OCR Platform'
    },
  },
  {
    path: "/home",
    component: () => import("@/views/Home/index.vue"),
    meta: { 
      hidden: true,
      title: 'yft-home'
    },
  },
  {
    path: "/",
    name: "/",
    component: () => import("@/views/Editor/index.vue"),
    meta: { 
      title: '全星科技'
    },
  },
  {
    path: "/github",
    component: () => import('@/views/OAuth/github.vue'),
    meta: { 
      title: 'yft-github'
    },
    // children: [
    //   {
    //     path: "/oauth/callback/github",
    //     component: () => import('@/views/OAuth/github.vue'),
    //     meta: {
    //       "keepAlive": true
    //     }
    //   },
    // ]
  },
  {
    path: "/401",
    component: () => import("@/views/Error/401.vue"),
    meta: { hidden: true },
  },
  {
    path: "/404",
    component: () => import("@/views/Error/404.vue"),
    meta: { hidden: true },
  },
];

/**
 * 创建路由
 */
const router = createRouter({
  history: createWebHistory(),
  routes: constantRoutes,
  // 刷新时，滚动条位置还原
  scrollBehavior: () => ({ left: 0, top: 0 }),
});

router.beforeEach((to: any, from: any, next: any) => {
  const hasToken = getItem('access_token')
  const userStore = useUserStore()

  if (hasToken) {
    if (to.path === '/login') {
      next({ path: '/home' })
    } else {
      next()
    }
    return
  }

  if (whiteList.indexOf(to.path) !== -1) {
    next()
    return
  }

  // TODO: temporary dev-only bypass for missing backend; remove before production
  if (import.meta.env.VITE_APP_SKIP_LOGIN === 'true') {
    const mockUser = {
      id: 1,
      uuid: 'admin-uuid',
      username: 'admin',
      nickname: '管理员',
      phone: '13800000000',
      avatar: '',
      deptId: 1,
      email: 'admin@example.com',
      isMultiLogin: false,
      isStaff: true,
      isSuperuser: true,
      joinTime: '2026-01-01 00:00:00',
      lastLoginTime: '2026-07-01 00:00:00',
    }

    setItem('access_token', 'mock-admin-token')
    setItem('user_info', mockUser)
    userStore.setLoginStatus(true)
    userStore.setToken('mock-admin-token')
    userStore.setUserInfo(mockUser)
    next({ path: '/home' })
    return
  }

  next(`/login?redirect=${to.path}`)
})

router.beforeResolve((to: any, from: any, next: any) => {
  window.document.title = to.meta.title
  next()
})

/**
 * 重置路由
 */
export const resetRouter = () => {
  router.replace({ path: "/" });
}

export default router;

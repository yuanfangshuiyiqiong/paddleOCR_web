export const setItem = (key: string, val: any) =>
  window.localStorage.setItem(key, JSON.stringify(val))

export const getItem = (key: string) => {
  const json = window.localStorage.getItem(key)
  return json ? JSON.parse(json) : null
}

export const removeItem = (key: string) =>
  window.localStorage.removeItem(key)

export const clear = () =>
  window.localStorage.clear()

export const setSessionItem = (key: string, val: any) =>
  window.sessionStorage.setItem(key, JSON.stringify(val))

export const getSessionItem = (key: string) => {
  const json = window.sessionStorage.getItem(key)
  return json ? JSON.parse(json) : null
}

export const removeSessionItem = (key: string) =>
  window.sessionStorage.removeItem(key)

export const clearSession = () =>
  window.sessionStorage.clear()

export const localStorage = {
  set: setItem,
  get: getItem,
  remove: removeItem,
  clear,
}

export const sessionStorage = {
  set: setSessionItem,
  get: getSessionItem,
  remove: removeSessionItem,
  clear: clearSession,
}

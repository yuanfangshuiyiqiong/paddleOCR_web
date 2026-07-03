<!-- src/views/Editor/CanvasICP/index.vue -->
<template>
  <div class="canvas-icp-container">
    <div class="absolute bottom-[5px] text-[12px] icp">
      进网许可证：<a href="https://beian.miit.gov.cn/">鄂ICP备2022008030号-1</a>
      <span class="w-[10px]"/>联系：15972699417
    </div>
  </div>
</template>

<script lang="ts" setup>
</script>

<style lang="scss" scoped>
.canvas-icp-container {
  position: fixed;
  bottom: 50px;
  left: 0;
  right: 0;
  z-index: 1001; /* 确保在 PageTabs 上方 */
  display: flex;
  justify-content: center;
}

.icp {
  width: calc(100% - 260px - 50px - 160px);
  display: flex;
  justify-content: center;
  a:hover {
    text-decoration: underline;
  }
}
</style>
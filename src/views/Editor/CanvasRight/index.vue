<template>
  <div>
    <div class="right-top">
      <div class="flex align-middle px-[20px]">
        <Lang />
      </div>
      <div>
        <!-- <el-button text>分享</el-button> -->
        <el-button type="primary" @click="exportFile">下载</el-button>
        <!-- <el-button text href="https://github.com/dromara/yft-design" tag="a" target="_blank" rel="noopener noreferrer"> -->
          <!-- <a href="https://github.com/dromara/yft-design" target="_blank" rel="noopener noreferrer"> -->
            <!-- <el-tooltip placement="top" :hide-after="0" :content="t("message.github")"> -->
            <!-- <IconGithub class="footer-button"></IconGithub> -->
            <!-- </el-tooltip> -->
          <!-- </a> -->
        <!-- </el-button> -->
      </div>
    </div>
    <div class="right-bottom">
      <div class="right-content">
        <AnnotationPanel />
      </div>
    </div>
    <FileExport v-model:visible="exportFileDialog" @close="exportFileHide" @save="exportFileHandle" />
  </div>
</template>
<script lang="ts" setup>
import Lang from "@/components/Lang/index.vue";
import AnnotationPanel from "./AnnotationPanel/index.vue";

const exportFileDialog = ref(false)

const exportFileHide = () => {
  exportFileDialog.value = false
}

const exportFileHandle = () => {
  exportFileDialog.value = false
}

const exportFile = () => {
  exportFileDialog.value = true
}
</script>

<style lang="scss" scoped>
.right-top {
  height: 40px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  border-bottom: 1px solid $borderColor;
}
.right-bottom {
  height: calc(100% - 40px);
}
.right-content {
  padding: 10px 5px 10px 10px;
  font-size: 13px;
  overflow-y: scroll;
  overflow-x: hidden;
  height: 100%;
}
</style>

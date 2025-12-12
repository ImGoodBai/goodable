# 模板目录使用说明

本目录用于存放项目模板。用户可以从模板快速创建新项目。

## 目录结构

每个模板是一个独立的子目录，结构如下：

```
templates/
  └─ your-template-id/          # 模板ID（目录名）
      ├─ template.json          # 模板元数据（必需）
      ├─ preview.png            # 预览图（可选，推荐 800x600）
      └─ project/               # 完整项目源文件（必需）
          ├─ app/
          ├─ package.json
          ├─ next.config.js
          └─ ...（完整的Next.js项目文件）
```

## template.json 格式

每个模板必须包含 `template.json` 文件，格式如下：

```json
{
  "id": "your-template-id",
  "name": "模板显示名称",
  "description": "模板的详细描述，会显示在模板卡片上",
  "category": "分类名称（如：游戏、工具、商城）",
  "tags": ["标签1", "标签2", "标签3"],
  "version": "1.0.0",
  "author": "作者名称",
  "createdAt": "2024-12-12",
  "preview": "preview.png"
}
```

### 必需字段
- `id`: 模板唯一标识符（与目录名一致）
- `name`: 模板显示名称

### 可选字段
- `description`: 模板描述
- `category`: 分类
- `tags`: 标签数组（最多显示3个）
- `version`: 版本号
- `author`: 作者
- `createdAt`: 创建日期
- `preview`: 预览图文件名（默认为 preview.png）

## 创建新模板步骤

### 方法一：从现有项目导出

1. 找到现有的成功项目（在 `data/projects/` 目录下）
2. 在 templates 目录创建新文件夹（如 `tetris`）
3. 复制项目文件到 `tetris/project/` 目录
4. 创建 `tetris/template.json` 元数据文件
5. （可选）添加 `preview.png` 预览图

**示例命令（Windows）：**
```bash
# 创建模板目录
mkdir templates\tetris
mkdir templates\tetris\project

# 复制项目文件
xcopy /E /I data\projects\project-xxx\* templates\tetris\project\

# 手动创建 template.json 和 preview.png
```

### 方法二：手动创建

1. 在 templates 目录创建新文件夹
2. 创建 `project/` 子目录，放入完整的 Next.js 项目
3. 创建 `template.json` 文件
4. 添加预览图（可选）

## 预览图要求

- **推荐尺寸**: 800x600 像素
- **支持格式**: PNG, JPG, SVG, WebP
- **文件名**: 默认为 `preview.png`，可在 template.json 中自定义
- **如果没有预览图**: 系统会自动生成灰色背景 + 模板名称的占位图

## 注意事项

1. **完整性**: `project/` 目录应包含完整可运行的项目（包括所有依赖配置）
2. **敏感信息**: 不要包含 `.env`、数据库文件、API密钥等敏感信息
3. **node_modules**: 可以包含，但不推荐（会增加模板体积）
4. **自动处理**: 系统会自动更新创建项目的 `package.json` 中的 `name` 字段
5. **缓存**: 模板列表会缓存1分钟，修改后重启应用或等待缓存过期

## 模板示例

参考 `templates/example-template/` 目录结构。

## 使用流程

1. 系统启动时自动扫描 templates 目录
2. 用户在工作台"模板库"页面查看所有模板
3. 点击"使用模板"创建新项目
4. 系统复制整个 `project/` 目录到新项目ID目录
5. 自动跳转到项目聊天页面

## 打包发布

打包发布时，templates 目录会被包含在构建产物中，用户无需单独下载模板。

# Pixiv-Spider
[![Author](https://img.shields.io/badge/author-chanshiyucx-blue.svg?style=flat-square)](https://chanshiyu.com)
[![QQ](https://img.shields.io/badge/QQ-1124590931-blue.svg?style=flat-square)](http://wpa.qq.com/msgrd?v=3&uin=&site=qq&menu=yes)
[![Email](https://img.shields.io/badge/Emali%20me-1124590931@qq.com-green.svg?style=flat-square)]()

## 食用
Pixiv-Spider 是一个基于 Nodejs 的 P 站图片爬虫，包含三种模式：收藏夹模式、关注者模式、作者列表模式，用于批量下载 P 站图片。

```bash
git clone git@github.com:chanshiyucx/Pixiv-Spider.git

cd Pixiv-Spider

npm install
```

待依赖包安装完毕，修改目录下的 `config.js` 配置文件，填写你的 P 站账号密码，自定义下载模式和筛选条件：
```js
module.exports = {
  username: '你的 P 站账号',
  password: '你的 P 站密码',
  mode: 'author', // star: 下载收藏夹, author: 下载作者列表, follow: 下载我关注的作者
  date: '', // 限定日期之内, 可以留空, 注意格式: '2018/01/01'
  // 以下是 mode 为 author 或 follow 才有的选项
  author: [], // 下载的作者列表
  tags: [], // 筛选标签
  rated: 0, // 最低点赞数筛选
  R18: true // 是否禁止 R18
}
```

完成之后，执行 `npm start` 开始下载。 

Just enjoy it ฅ●ω●ฅ

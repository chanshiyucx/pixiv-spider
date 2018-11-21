const fs = require('fs')
const readline = require('readline')
const axios = require('axios')
const cheerio = require('cheerio')
const Promise = require('bluebird')
const querystring = require('querystring')

const config = require('./config')
const { mode, author, tags, rated, date } = config

// 限制日期
const temp = (date || '2000/01/01').split('/')
const limitDate = new Date()
limitDate.setFullYear(+temp[0], +temp[1] - 1, +temp[2])

// 地址真是多得记不住啊 /(ㄒoㄒ)/~~
const LOGIN_URL = 'https://accounts.pixiv.net/login?lang=zh&source=pc&view_type=page&ref=wwwtop_accounts_index'
const LOGIN_API = 'https://accounts.pixiv.net/api/login?lang=zh'
const STAR_URL = 'https://www.pixiv.net/bookmark.php?rest=show&order=desc'
const IMG_URL = 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id='
const MANAGE_URL = 'https://www.pixiv.net/member_illust.php?mode=manga_big&illust_id='
const AUTHOR_URL = 'https://www.pixiv.net/member_illust.php?id='
const FOLLOW_URL = 'https://www.pixiv.net/bookmark.php?type=user&rest=show&p='
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36'

class Pixiv {
  constructor() {
    this.username = ''
    this.password = ''
    this.mode = mode
    this.cookie = ''
    this.history = []
    this.author = ''
    this.outDate = false
  }

  // 输入账户信息
  async inputUser() {
    return new Promise(resolve => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
      rl.setPrompt('请输入P站账户> ')
      rl.prompt()
      rl.on('line', line => {
        const input = line.trim()
        if (!input.length) {
          rl.prompt()
        } else if (!this.username) {
          this.username = input
          rl.setPrompt('请输入账户密码> ')
          rl.prompt()
        } else if (!this.password) {
          this.password = input
          rl.close()
          resolve()
        }
      })
    }).catch(err => console.log(err))
  }

  // 获取登陆 key
  async getKey() {
    try {
      const res = await axios({
        method: 'get',
        url: LOGIN_URL,
        header: {
          'User-Agent': USER_AGENT
        }
      })
      const $ = cheerio.load(res.data)
      const postKey = $('input[name="post_key"]').val()
      const postCookie = res.headers['set-cookie'].join('; ')
      return { postKey, postCookie }
    } catch (err) {
      console.log(err)
    }
  }

  // 登陆
  async login({ postKey, postCookie }) {
    try {
      const res = await axios({
        method: 'post',
        url: LOGIN_API,
        headers: {
          'User_Agent': USER_AGENT,
          'Content_Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Origin': 'https://accounts.pixiv.net',
          'Referer': 'https://accounts.pixiv.net/login?lang=zh&source=pc&view_type=page&ref=wwwtop_accounts_index',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': postCookie
        },
        data: querystring.stringify({
          pixiv_id: this.username,
          password: this.password,
          captcha: '',
          g_recaptcha_response: '',
          post_key: postKey,
          source: 'pc',
          ref: 'wwwtop_accounts_index',
          return_to: 'https://www.pixiv.net/'
        })
      })
      console.log('Login success!')
      const cookie = res.headers['set-cookie'].join('; ')
      fs.writeFileSync('cookie.txt', cookie)
      return cookie
    } catch (err) {
      console.log(err)
    }
  }

  // 获取总页数
  async getPageSize(url) {
    try {
      const res = await axios({
        method: 'get',
        url: url,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net',
          'Cookie': this.cookie
        }
      })
      const $ = cheerio.load(res.data)
      const pageList = $('.page-list')
      const pageSize = pageList.length ? pageList.children().last().find('a').text() : 1
      return pageSize
    } catch (err) {
      console.log(err)
    }
  }

  // 获取画师列表
  async getAuthor(url) {
    try {
      const res = await axios({
        method: 'get',
        url: url,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net',
          'Cookie': this.cookie
        }
      })
      const $ = cheerio.load(res.data)
      const members = $('.members').find('li')
      let author = []
      members.each(function () {
        const user = $(this).find('input').val()
        author.push(user)
      })
      return author
    } catch (err) {
      console.log(err)
    }
  }

  // 遍历画师列表下载
  async downloadByAuthorList(authorList) {
    try {
      for (const a of authorList) {
        console.log(`\n--------开始下载画师 ${a} 的作品--------`)
        this.history = [] // 管理下载记录，避免重复下载
        this.author = a // 当前下载的作者，保存路径
        this.outDate = false
        await this.downloadByAuthor(a)
      }
    } catch (err) {
      console.log(err)
    }
  }

  // 按画师下载
  async downloadByAuthor(author) {
    try {
      // tags 需要遍历
      if (!tags.length) tags[0] = ''
      for (const tag of tags) {
        const defaultUrl = `${AUTHOR_URL}${author}&type=all${tag ? '&tag=' + encodeURI(tag) : ''}`
        const pageSize = await this.getPageSize(defaultUrl)
        for (let i = 1; i <= pageSize; i++) {
          if (this.outDate) continue // 如果超出了期限，后面无需遍历了，开始下一个作者
          console.log(`--------开始下载第${i}页--------`)
          const url = `${defaultUrl}&p=${i}`
          const imgList = await this.getImgList(url)
          const length = imgList.length
          console.log(`${length ? '找到 ' + length + ' 个作品 ♪(^∇^*)' : '没有找到符合条件的作品 /(ㄒoㄒ)/~~'}`)
          await Promise.map(imgList, (img) => this.download(img), { concurrency: 5 })
        }
      }
    } catch (err) {
      console.log(err)
    }
  }

  // 获取整页作品
  async getImgList(url) {
    try {
      const res = await axios({
        method: 'get',
        url: url,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net',
          'Cookie': this.cookie
        }
      })
      const $ = cheerio.load(res.data)
      const list = $('._image-items').eq(0).find('.image-item')
      const imgList = []
      // 如果是下载作者列表，那么不需要每次都去获取作者，而且也获取不到
      let author
      if (this.mode !== 'star') {
        author = $('.user-name').text()
      }
      const self = this // 哎，老办法
      list.each(function () {
        const id = $(this).find('img').attr('data-id')
        const name = $(this).find('.title').text()
        author = author || $(this).find('.user').text()
        // 日期限制，从小图链接提取日期
        const src = $(this).find('img').attr('data-src')
        const suffix = src.split('/img-master/img/')[1]
        const publishedAt = (suffix.slice(0, 10)).split('/') // 2016/01/26
        const img = {
          id,
          name,
          author
        }
        const imgDate = new Date()
        // 表示月份的参数介于 0 到 11 之间, 需要减 1
        imgDate.setFullYear(+publishedAt[0], +publishedAt[1] - 1, +publishedAt[2])
        if (imgDate < limitDate) {
          self.outDate = true // 设置标记，不需要再遍历下一页了
        } else {
          imgList.push(img)
        }
      })
      return imgList
    } catch (err) {
      console.log(err)
    }
  }

  // 整理单个收藏
  async download({ id, name, author }) {
    // 根据下载记录判断是否必要下载
    if (this.mode !== 'star' && this.history.includes(id)) return
    try {
      const src = `${IMG_URL}${id}`
      const res = await axios({
        method: 'get',
        url: src,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net/bookmark.php?rest=show&order=date_d',
          'Cookie': this.cookie
        }
      })
      // P站改版后动态渲染页面，需要找更好的方法获取图片链接
      const rootSrc = res.data.split(`"original":"`)[1].split(`"},"tags":`)[0]
      const imgUrl = rootSrc.replace(/(\\r)/g, " ").replace(/\\/g, "")
      await this.downloadImg({ id, name, author, imgUrl })
    } catch (err) {
      console.log(err)
    }
  }

  // 下载图片
  async downloadImg({ id, name, author, imgUrl }) {
    if (!imgUrl) {
      console.log(`图片 ${id} 解析错误，请检查知悉！`)
      return
    }
    return new Promise((resolve, reject) => {
      axios({
        method: 'get',
        url: imgUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net/bookmark.php?rest=show&order=date_d',
          'Cookie': this.cookie
        }
      }).then(res => {
        if (!this.history.length && this.mode !== 'star') {
          // 判断是否存在该作者的目录
          const authorPath = `download/${this.author}`
          if (!fs.existsSync(authorPath)) {
            fs.mkdirSync(authorPath)
          }
        }

        const fileName = imgUrl.substring(imgUrl.lastIndexOf('/') + 1)
        const savePath = this.mode === 'star' ? `download/star/${fileName}` : `download/${this.author || 'default'}/${fileName}`
        res.data.pipe(fs.createWriteStream(savePath)).on('close', () => {
          console.log(`下载完成: 文件: ${fileName}    作品: ${name}    画师：${author}`)
          // 下载完成保存，避免重复下载
          if (this.mode !== 'star') this.history.push(id)
          resolve()
        })
      }).catch(err => reject(err))
    }).catch(console.err)
  }

  // 启动
  async start() {
    console.log("\n程序启动(●'◡'●)  DesignedBy 蝉時雨")
    await this.inputUser()
    let showTags = ''
    tags.forEach(o => { showTags += ` ${o}` })
    const inx = ['star', 'author', 'follow'].findIndex(o => o === mode)
    const showMode = ['收藏夹模式', '作者列表模式', '关注者模式'][inx]
    console.log(`当前模式：${showMode}  限定日期: ${date}  ${mode !== 'star' ? '筛选标签:' + showTags : ''}`)

    // 如果不存在下载目录则新建
    if (!fs.existsSync('download')) {
      fs.mkdirSync('download')
    }
    // 如果不存在 cookie 则登陆获取
    if (!fs.existsSync('cookie.txt')) {
      const key = await this.getKey()
      this.cookie = await this.login(key)
    } else {
      this.cookie = fs.readFileSync('cookie.txt', 'utf8')
    }
    if (this.mode === 'star') {
      // 下载收藏夹
      if (!fs.existsSync('download/star')) {
        fs.mkdirSync('download/star')
      }
      const pageSize = await this.getPageSize(STAR_URL)
      for (let i = 1; i <= pageSize; i++) {
        if (this.outDate) return
        console.log(`--------开始下载第${i}页--------`)
        const url = `${STAR_URL}&p=${i}`
        const imgList = await this.getImgList(url)
        await Promise.map(imgList, (img) => this.download(img), { concurrency: 5 })
      }
      console.log('\n收藏夹下载完成 o(*￣▽￣*)ブ')
    } else if (this.mode === 'author' && author.length) {
      await this.downloadByAuthorList(author)
      console.log('\n作者列表下载完成 o(*￣▽￣*)ブ')
    } else if (this.mode === 'follow') {
      // 下载已关注的作者作品
      const pageSize = await this.getPageSize(`${FOLLOW_URL}1`)
      for (let i = 1; i <= pageSize; i++) {
        const defaultUrl = `${FOLLOW_URL}${i}`
        const author = await this.getAuthor(defaultUrl)
        await this.downloadByAuthorList(author)
        console.log('\n关注作者下载完成 o(*￣▽￣*)ブ')
      }
    }
  }
}

// 开始启动
const pixiv = new Pixiv()
pixiv.start()

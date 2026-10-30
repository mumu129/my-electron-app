- [ ] 去除字段配置功能和ui

- [ ] 修改parse。js中的解析算法。解析算法不使用宽容语法来避免报错，就是要让他直接运算，才能知道解析的文本内容类型到底是什么，直接转化,只包含一下内容不添加其他内容，a-b代表a转b和b转a,
    - utf-8 - base64
    - 表单 - json
    - base64 - hex
    - url 加解码
    - utf-8 - hex
    - zlib
    - deflate
    - cookie,gwt
    - MD5
    - jiem
    - 一堆对称加密
    - 一堆非对称加密
    - json.parse() - json.stritify
    - time时间戳，10位，13位
    - Number()，+-*/
    - Math.floor 取整
    - 去除jsonnp包裹壳
    - JS表达式，比如之前请求的返回值
    

- [ ] 
    // 交给底座渲染的目标记录：外观（图标尺寸/描边/颜色、按钮结构与菜单）由底座统一决定，
    // 这里只声明目标身份与自己的路由前缀。
    // route 用文档相对路径（去前导斜杠）：web 与 Desktop 的 dsh-app:// 协议下才同源可达。
    const TARGET = {
      id: "codebuddy",
      label: "CodeBuddy CN",
      route: "open-in-codebuddy",
      // 24×24 描边路径数据（方块脸 + 双耳 + 双眼的线条化形象）；与 assets/codebuddy-cn-line.svg
      // 逐条对应，由 client 自测比对，防止内联数据与素材漂移。
      icon: [
        "M8 8h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z",
        "M8 8 9.6 4 11.2 8",
        "M12.8 8 14.4 4 16 8",
        "M10 12.5v3",
        "M14 12.5v3",
      ],
    };

const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://mage.bca.id" : `http://localhost:4321`,
  email: "contact@bca.id",
  socialCard: "",
  github: "https://github.com/bcamaster/new-mage",
  discord: "",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}

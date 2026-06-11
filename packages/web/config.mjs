const stage = process.env.SST_STAGE || "dev"
const github = "https://github.com/bcamaster/new-mage"

export default {
  url: stage === "production" ? "https://mage.bca.id" : `http://localhost:4321`,
  email: "contact@bca.id",
  socialCard: "",
  github,
  discord: "",
  version: "v0.4.2",
  headerLinks: [
    { name: "app.header.docs",      url: "/docs/" },
    { name: "app.header.catalog",   url: "/hub/" },
    { name: "app.header.changelog", url: "/changelog/" },
  ],
}

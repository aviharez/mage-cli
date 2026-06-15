const stage = process.env.SST_STAGE || "dev"
const github = ""

export default {
  url: stage === "production" ? "https://mage.bca.id" : `http://localhost:4321`,
  email: "contact@bca.co.id",
  socialCard: "",
  github,
  discord: "",
  version: "1.2.8",
  headerLinks: [
    { name: "app.header.docs",      url: "/docs/" },
    { name: "app.header.catalog",   url: "/hub/" },
    { name: "app.header.changelog", url: "/changelog/" },
  ],
}

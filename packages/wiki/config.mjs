const stage = process.env.SST_STAGE || "dev"
const github = ""

export default {
  url: stage === "production" ? "https://mage.bca.id" : `http://localhost:4321`,
  email: "contact@bca.co.id",
  socialCard: "",
  github,
  discord: "",
  version: "1.2.11",
  headerLinks: [
    { name: "app.header.docs",      url: "/docs/" },
    { name: "app.header.rune",      url: "https://rune-mage.apps.ocpdevgra.dti.co.id" },
    { name: "app.header.changelog", url: "/changelog/" },
  ],
}

import Image from "next/image";

interface SocialLink {
  name: string;
  icon: string;
  width: number;
  height: number;
  href: string;
}

const SOCIAL_LINKS: SocialLink[] = [
  {
    name: "Facebook",
    icon: "/icons/footer-facebook.svg",
    width: 32,
    height: 32,
    href: "#",
  },
  {
    name: "Instagram",
    icon: "/icons/footer-instagram.svg",
    width: 32,
    height: 32,
    href: "#",
  },
  {
    name: "WhatsApp",
    icon: "/icons/footer-whatsapp.svg",
    width: 32,
    height: 32,
    href: "#",
  },
  {
    name: "TikTok",
    icon: "/icons/footer-tiktok.svg",
    width: 28,
    height: 32,
    href: "#",
  },
  {
    name: "YouTube",
    icon: "/icons/footer-youtube.svg",
    width: 46,
    height: 32,
    href: "#",
  },
];

interface FooterColumn {
  title: string;
  links: string[];
}

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Program",
    links: ["DimenAcademy", "DimenTalk"],
  },
  {
    title: "Resource",
    links: ["Artikel", "Tips & Trick", "FAQ", "Panduan Pendaftaran"],
  },
];

interface ContactItem {
  icon: string;
  width: number;
  height: number;
  label: string;
}

const CONTACTS: ContactItem[] = [
  {
    icon: "/icons/footer-location.svg",
    width: 24,
    height: 24,
    label: "Sleman, Yogyakarta",
  },
  {
    icon: "/icons/footer-whatsapp.svg",
    width: 24,
    height: 24,
    label: "082225982026",
  },
  {
    icon: "/icons/footer-gmail.svg",
    width: 32,
    height: 24,
    label: "info.dimentoring.id@gmail.com",
  },
];

export default function Footer() {
  return (
    <footer className="flex w-full flex-col gap-10 bg-[#F9F9F9] px-20 pt-20 pb-10 shadow-[0px_-2px_4px_0px_rgba(0,0,0,0.1)]">
      <div className="flex w-full items-center justify-between">
        <div className="flex flex-col items-center gap-[75px]">
          <Image
            src="/icons/navbar-logo.svg"
            width={282}
            height={88}
            alt="Dimentoring"
          />
          <div className="flex items-center gap-12">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.name}
                href={social.href}
                aria-label={social.name}
              >
                <Image
                  src={social.icon}
                  width={social.width}
                  height={social.height}
                  alt=""
                />
              </a>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-[91px]">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col items-start gap-6">
              <p className="text-[32px] leading-[1.5] font-semibold tracking-[-0.64px] text-black">
                {column.title}
              </p>
              <div className="flex flex-col items-start gap-[18px]">
                {column.links.map((link) => (
                  <p
                    key={link}
                    className="text-2xl leading-[1.5] tracking-[-0.48px] whitespace-nowrap text-black"
                  >
                    {link}
                  </p>
                ))}
              </div>
            </div>
          ))}

          <div className="flex w-[419px] flex-col items-start gap-6">
            <p className="text-[32px] leading-[1.5] font-semibold tracking-[-0.64px] text-black">
              Kontak
            </p>
            <div className="flex w-full flex-col items-start gap-[18px]">
              {CONTACTS.map((contact) => (
                <div key={contact.label} className="flex items-center gap-4">
                  <Image
                    src={contact.icon}
                    width={contact.width}
                    height={contact.height}
                    alt=""
                  />
                  <p className="text-2xl leading-[1.5] tracking-[-0.48px] whitespace-nowrap text-black">
                    {contact.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="w-full text-center text-2xl leading-[1.5] tracking-[-0.48px] text-[#979696]">
        Copyright @2026 dimentoring.id
      </p>
    </footer>
  );
}

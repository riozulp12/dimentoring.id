import Image from "next/image";
import Link from "next/link";
import Logo from "../ui/Logo";

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
    <footer className="flex w-full flex-col gap-10 bg-[#F9F9F9] px-5 pt-12 pb-8 shadow-[0px_-2px_4px_0px_rgba(0,0,0,0.1)] sm:px-8 md:px-12 lg:px-20 lg:pt-20 lg:pb-10">
      <div className="flex w-full flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col items-center gap-8 sm:gap-12 lg:gap-[75px]">
          <Link href="/" aria-label="Ke landing page" className="flex items-center">
            <Logo variant="primary" mark="full" className="h-12 w-auto sm:h-16 lg:h-[88px]" />
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 lg:gap-12">
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
                  className="h-4 w-auto sm:h-5 lg:h-6"
                />
              </a>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-10 sm:flex-row sm:flex-wrap sm:items-start sm:justify-center sm:gap-12 lg:w-auto lg:items-start lg:justify-start lg:gap-[91px]">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col items-center gap-4 sm:items-start sm:gap-6">
              <p className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black">
                {column.title}
              </p>
              <div className="flex flex-col items-center gap-3 sm:items-start sm:gap-[18px]">
                {column.links.map((link) => (
                  <p
                    key={link}
                    className="text-lg leading-[1.5] tracking-[-0.36px] whitespace-nowrap text-black"
                  >
                    {link}
                  </p>
                ))}
              </div>
            </div>
          ))}

          <div className="flex w-full flex-col items-center gap-4 sm:w-auto sm:items-start sm:gap-6 lg:w-[419px]">
            <p className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black">
              Kontak
            </p>
            <div className="flex w-full flex-col items-center gap-3 sm:items-start sm:gap-[18px]">
              {CONTACTS.map((contact) => (
                <div key={contact.label} className="flex items-center gap-4">
                  <Image
                    src={contact.icon}
                    width={contact.width}
                    height={contact.height}
                    alt=""
                    className="h-5 w-auto sm:h-6"
                  />
                  <p className="text-lg leading-[1.5] tracking-[-0.36px] whitespace-nowrap text-black">
                    {contact.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="w-full text-center text-lg leading-[1.5] tracking-[-0.36px] text-[#979696]">
        Copyright @2026 dimentoring.id
      </p>
    </footer>
  );
}

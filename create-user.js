const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createUser() {
  try {
    // Şifreyi hash'le
    const hashedPassword = await bcrypt.hash('123', 10);
    
    // Önce şirket oluştur veya bul
    let company = await prisma.company.findFirst({
      where: { name: 'Ege Helvacı Company' }
    });
    
    if (!company) {
      company = await prisma.company.create({
        data: { name: 'Ege Helvacı Company' }
      });
      console.log('Şirket oluşturuldu:', company.name);
    } else {
      console.log('Şirket bulundu:', company.name);
    }
    
    // Kullanıcıyı oluştur
    const user = await prisma.user.create({
      data: {
        email: 'egehelvaci@gmail.com',
        password: hashedPassword,
        name: 'Ege Helvacı',
        companyId: company.id
      },
      include: { company: true }
    });
    
    console.log('✅ Kullanıcı başarıyla oluşturuldu:');
    console.log('📧 Email:', user.email);
    console.log('👤 İsim:', user.name);
    console.log('🏢 Şirket:', user.company.name);
    console.log('🆔 ID:', user.id.toString());
    console.log('🔐 Şifre: 123');
    
  } catch (error) {
    if (error.code === 'P2002') {
      console.log('⚠️  Bu email adresi zaten kullanımda!');
      
      // Mevcut kullanıcıyı göster
      const existingUser = await prisma.user.findUnique({
        where: { email: 'egehelvaci@gmail.com' },
        include: { company: true }
      });
      
      if (existingUser) {
        console.log('📧 Mevcut kullanıcı bilgileri:');
        console.log('👤 İsim:', existingUser.name);
        console.log('🏢 Şirket:', existingUser.company.name);
        console.log('🆔 ID:', existingUser.id.toString());
      }
    } else {
      console.error('❌ Hata:', error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

createUser();

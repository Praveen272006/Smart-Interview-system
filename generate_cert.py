from datetime import datetime, timedelta, timezone
from ipaddress import ip_address

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa


# Generate a private key
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
)

# Certificate subject
subject = issuer = x509.Name([
    x509.NameAttribute(
        NameOID.COMMON_NAME,
        "10.81.159.174",
    ),
])

# Include the LAN IP and localhost
san = x509.SubjectAlternativeName([
    x509.IPAddress(ip_address("10.81.159.174")),
    x509.IPAddress(ip_address("127.0.0.1")),
    x509.DNSName("localhost"),
])

# Generate a self-signed development certificate
certificate = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(issuer)
    .public_key(private_key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.now(timezone.utc))
    .not_valid_after(
        datetime.now(timezone.utc) + timedelta(days=365)
    )
    .add_extension(san, critical=False)
    .sign(private_key, hashes.SHA256())
)

# Save the private key
with open("key.pem", "wb") as file:
    file.write(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )

# Save the certificate
with open("cert.pem", "wb") as file:
    file.write(
        certificate.public_bytes(
            serialization.Encoding.PEM
        )
    )

print("Certificate generated successfully!")
print("Created: key.pem")
print("Created: cert.pem")
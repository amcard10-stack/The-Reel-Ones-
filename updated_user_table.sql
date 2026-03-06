CREATE TABLE `user` (
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `profile_picture` varchar(255) DEFAULT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `display_name` varchar(100) DEFAULT NULL,
  `bio` text DEFAULT NULL,
   PRIMARY KEY (`email`)
) 